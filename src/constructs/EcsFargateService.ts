import {
  aws_logs as logs,
  aws_ecs as ecs,
  aws_secretsmanager as secrets,
  aws_elasticloadbalancingv2 as loadbalancing,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Statics } from '../Statics';

export interface EcsFargateServiceProps {
  /**
   * The name of this ECS fargate service.
   * A service suffix is automatically added.
   */
  serviceName: string;

  /**
   * Provide a servet that contains the credentials
   * key value pairs with username and password to a dockerhub account.
   */
  dockerhubSecret?: secrets.ISecret;

  /**
   * The ECS cluster to which to add this fargate service
   */
  ecsCluster: ecs.Cluster;

  /**
   * The loadbalancer listner to which to connect this service
   */
  listner: loadbalancing.IApplicationListener;

  /**
   * Desired numer of tasks that should run in this service.
   */
  desiredtaskcount?: number;

  /**
   * The container image to use (e.g. on dockerhub)
   */
  containerImage: string;

  /**
   * Container listing port
   */
  containerPort: number;

  /**
   * Service listner path
   * (i.e. the path that the loadbalancer will use for this service)
   * Example: '/api/*'
   */
  serviceListnerPath: string;

  /**
   * Indicator if sport instances should be used for
   * running the tasks on fargate
   */
  useSpotInstances?: boolean;

  /**
   * Set a token that must be send using the
   * X-Cloudfront-Access-Token header from cloudfront to allow the
   * request to pass trough the loadbalancer.
   */
  cloudfrontOnlyAccessToken?: string;

}


/**
 * The ecs fargate service construct:
 * - defines a service with a single task
 * - the task consists of a single container
 * - creates a log group for the service
 * - exposes a single container port to the loadbalancer over http
 */
export class EcsFargateService extends Construct {

  readonly logGroupArn: string;

  constructor(scope: Construct, id: string, props: EcsFargateServiceProps) {
    super(scope, id);

    // Logging
    const logGroup = this.logGroup(props);
    this.logGroupArn = logGroup.logGroupArn;

    // Task, service and expose to loadbalancer
    const task = this.setupTaskDefinition(logGroup, props);
    const service = this.setupFargateService(task, props);
    this.setupLoadbalancerTarget(service, props);

  }


  /**
   * Exposes the service to the loadbalancer listner on a given path and port
   * @param service
   * @param props
   */
  private setupLoadbalancerTarget(service: ecs.FargateService, props: EcsFargateServiceProps) {

    const conditions = [
      loadbalancing.ListenerCondition.pathPatterns([props.serviceListnerPath]),
    ];
    if (props.cloudfrontOnlyAccessToken) {
      conditions.push(loadbalancing.ListenerCondition.httpHeader('X-Cloudfront-Access-Token', [Statics.cloudfrontAlbAccessToken]));
    }

    props.listner.addTargets(`${props.serviceName}-target`, {
      port: props.containerPort,
      protocol: loadbalancing.ApplicationProtocol.HTTP,
      targets: [service],
      conditions,
      priority: 10,
      // TODO healthcheck for all containers
      // healthCheck: {
      //   enabled: true,
      //   path: props.healthCheckSettings.path,
      //   healthyHttpCodes: '200',
      //   healthyThresholdCount: 2,
      //   unhealthyThresholdCount: 6,
      //   timeout: Duration.seconds(10),
      //   interval: Duration.seconds(15),
      //   protocol: elasticloadbalancingv2.Protocol.HTTP,
      // },
      //deregistrationDelay: Duration.minutes(1),
    });
  }


  /**
   * Setup a basic log group for this service's logs
   * @param props
   */
  private logGroup(props: EcsFargateServiceProps) {
    const logGroup = new logs.LogGroup(this, `${props.serviceName}-logs`, {
      retention: logs.RetentionDays.ONE_DAY, // TODO Very short lived (no need to keep demo stuff)
    });
    return logGroup;
  }

  /**
   * Create a task definition with a single container for
   * within the fargate service
   * @param props
   */
  private setupTaskDefinition(logGroup: logs.ILogGroup, props: EcsFargateServiceProps) {

    const taskDef = new ecs.TaskDefinition(this, `${props.serviceName}-task`, {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '256', // TODO Uses minimal cpu and memory
      memoryMiB: '512',
    });

    taskDef.addContainer(`${props.serviceName}-container`, {
      image: ecs.ContainerImage.fromRegistry(props.containerImage, {
        credentials: props.dockerhubSecret,
      }),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: logGroup,
      }),
      portMappings: [{
        containerPort: props.containerPort,
      }],
    });
    return taskDef;
  }

  /**
   * Define the service in the cluster
   * @param task the ecs task definition
   * @param props
   */
  private setupFargateService(task: ecs.TaskDefinition, props: EcsFargateServiceProps) {
    const service = new ecs.FargateService(this, `${props.serviceName}-service`, {
      cluster: props.ecsCluster,
      serviceName: `${props.serviceName}-service`,
      taskDefinition: task,
      desiredCount: props.desiredtaskcount,
      capacityProviderStrategies: [
        {
          capacityProvider: props.useSpotInstances ? 'FARGATE_SPOT' : 'FARGATE',
          weight: 1,
        },
      ],
    });
    service.node.addDependency(props.ecsCluster);
    return service;
  }

}