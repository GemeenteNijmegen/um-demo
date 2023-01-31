import {
  aws_logs as logs,
  aws_ecs as ecs,
  aws_secretsmanager as secrets,
  aws_elasticloadbalancingv2 as loadbalancing,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

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

}

export class EcsFargateService extends Construct {

  readonly logGroupArn: string;

  constructor(scope: Construct, id: string, props: EcsFargateServiceProps) {
    super(scope, id);

    /**
     * Setup a basic log group for this service's logs
     */
    const logGroup = new logs.LogGroup(this, `${props.serviceName}-logs`, {
      retention: logs.RetentionDays.ONE_DAY, // Very short lived (no need to keep demo stuff)
    });
    this.logGroupArn = logGroup.logGroupArn;

    /**
     * Setup the task definition
    */
    // TODO Uses minimal cpu and memory
    const taskDef = new ecs.TaskDefinition(this, `${props.serviceName}-task`, {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '256',
      memoryMiB: '512',
    });

    /**
     * Add a container to the task definition
     */
    //const dockerhub = secrets.Secret.fromSecretNameV2(this, 'dockerhub-secret', Statics.secretDockerHub);
    taskDef.addContainer( `${props.serviceName}-container`, {
      image: ecs.ContainerImage.fromRegistry(props.containerImage, {
        credentials: props.dockerhubSecret,
      }),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'logs',
        logGroup,
      }),
      portMappings: [{
        containerPort: props.containerPort,
      }],
    });

    /**
     * Define the service in the cluster
     */
    const service = new ecs.FargateService(this, `${props.serviceName}-service`, {
      cluster: props.ecsCluster,
      serviceName: `${props.serviceName}-service`,
      taskDefinition: taskDef,
      desiredCount: props.desiredtaskcount,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT', // USE spot instances
          weight: 1,
        },
      ],
    });
    service.node.addDependency(props.ecsCluster);


    props.listner.addTargets(`${props.serviceName}-target`, {
      port: props.containerPort,
      protocol: loadbalancing.ApplicationProtocol.HTTP,
      targets: [service],
      conditions: [
        loadbalancing.ListenerCondition.pathPatterns([props.serviceListnerPath]),
        //loadbalancing.ListenerCondition.httpHeader('Custom-HTTP-Header', [statics.cloudfrontToAlbHeaderValue]),
      ],
      priority: 10,
      //default healthcheck for all containers
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

}