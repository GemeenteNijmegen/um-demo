import {
  aws_logs as logs,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as loadbalancing,
  Duration,
  aws_cloudfront_origins as origins,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { Statics } from '../Statics';

export interface EcsFargateServiceProps {
  /**
   * The name of this ECS fargate service.
   * A service suffix is automatically added.
   */
  serviceName: string;

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
  containerImage: ecs.ContainerImage;

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


  /**
   * The priorory of this service registered in the loadbalancer
   */
  priority: number;


  /**
   * Provide the task definition CPU specs
   * 256 (.25 vCPU) - Available memory values: 512 (0.5 GB), ...
   * 512 (.5 vCPU) - Available memory values: 1024 (1 GB), ...
   * 1024 (1 vCPU) - Available memory values: 2048 (2 GB), ...
   * ...
   */
  cpu: string;

  /**
   * Provide the task definition memory specs
   * 512 (0.5 GB), 1024 (1 GB), 2048 (2 GB) - Available cpu values: 256 (.25 vCPU)
   * 1024 (1 GB), 2048 (2 GB), 3072 (3 GB), 4096 (4 GB) - Available cpu values: 512 (.5 vCPU)
   * ...
   */
  memoryMiB: string;


  /**
   * Configure how long the loadbalancer should wait before starting
   * the health checks
   */
  healthCheckGracePeriod?: Duration;

  healthCheckPath?: string;


  distribution: Distribution;


  environment?: {[key: string]: string};
  secrets?: {[key: string]: ecs.Secret};

  runtimePlatform?: ecs.RuntimePlatform;

}


/**
 * The ecs fargate service construct:
 * - defines a service with a single task
 * - the task consists of a single container
 * - creates a log group for the service
 * - exposes a single container port to the loadbalancer over http
 *
 * Note this might be replacable with https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html
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

    // Cloudfront behaviour
    const hostedZoneName = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneName);
    const albDomainName = `alb.${hostedZoneName}`;
    props.distribution.addBehavior(props.serviceListnerPath,
      new origins.HttpOrigin(albDomainName, {
        //originPath: props.serviceListnerPath,
        protocolPolicy: OriginProtocolPolicy.MATCH_VIEWER,
        customHeaders: {
          'X-Cloudfront-Access-Token': Statics.cloudfrontAlbAccessToken,
        },
      }), {
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      });

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
      priority: props.priority,
      // TODO healthcheck for all containers
      healthCheck: {
        path: props.healthCheckPath,
      },
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
      runtimePlatform: props.runtimePlatform,
      cpu: props.cpu,
      memoryMiB: props.memoryMiB,
    });

    taskDef.addContainer(`${props.serviceName}-container`, {
      image: props.containerImage,
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: logGroup,
      }),
      portMappings: [{
        containerPort: props.containerPort,
      }],
      environment: props.environment,
      secrets: props.secrets,
    });
    console.log('Setting environment for service', props.serviceName, props.environment);
    return taskDef;
  }

  /**
   * Define the service in the cluster
   * @param task the ecs task definition
   * @param props
   */
  private setupFargateService(task: ecs.TaskDefinition, props: EcsFargateServiceProps) {
    const service = new ecs.FargateService(this, `${props.serviceName}-service`, {
      healthCheckGracePeriod: props.healthCheckGracePeriod,
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
      cloudMapOptions: {
        name: props.serviceName,
      },
    });
    service.node.addDependency(props.ecsCluster);
    return service;
  }

}