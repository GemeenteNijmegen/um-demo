import {
  Stack, Fn, Aws, StackProps,
  aws_ecs as ecs,
  aws_ssm as ssm,
  aws_ec2 as ec2,
  aws_logs as logs,
  aws_elasticloadbalancingv2 as loadbalancing,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_certificatemanager as acm,
  aws_secretsmanager as secrets,
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Statics } from './Statics';

export interface ContainerClusterStackProps extends StackProps {

}

export class ContainerClusterStack extends Stack {

  constructor(scope: Construct, id: string, props: ContainerClusterStackProps) {
    super(scope, id, props);


    const vpc = this.setupVpc();
    const listner = this.setupLoadbalancer(vpc);
    const cluster = this.constructEcsCluster(vpc);

    this.addHelloWorldContainer(cluster, listner);
  }

  private setupVpc() {
    // Import vpc config
    const routeTablePublicSubnet1Id = ssm.StringParameter.valueForStringParameter(this, '/gemeentenijmegen/vpc/route-table-public-subnet-id');
    const routeTablePublicSubnet2Id = ssm.StringParameter.valueForStringParameter(this, '/gemeentenijmegen/vpc/route-table-public-subnet-id');
    const routeTablePublicSubnet3Id = ssm.StringParameter.valueForStringParameter(this, '/gemeentenijmegen/vpc/route-table-public-subnet-id');

    //VPC setup for ECS cluster
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'vpc', {
      vpcId: ssm.StringParameter.valueForStringParameter(this, '/gemeentenijmegen/vpc/vpc-id'),
      availabilityZones: [0, 1, 2].map(i => Fn.select(i, Fn.getAzs(Aws.REGION))),
      privateSubnetRouteTableIds: [1, 2, 3].map(i => ssm.StringParameter.valueForStringParameter(this, `/gemeentenijmegen/vpc/route-table-private-subnet-${i}-id`)),
      publicSubnetRouteTableIds: [
        routeTablePublicSubnet1Id,
        routeTablePublicSubnet2Id,
        routeTablePublicSubnet3Id,
      ],
      publicSubnetIds: [1, 2, 3].map(i => ssm.StringParameter.valueForStringParameter(this, `/gemeentenijmegen/vpc/public-subnet-${i}-id`)),
      privateSubnetIds: [1, 2, 3].map(i => ssm.StringParameter.valueForStringParameter(this, `/gemeentenijmegen/vpc/private-subnet-${i}-id`)),
    });

    return vpc;
  }

  private constructEcsCluster(vpc: ec2.IVpc) {
    /**
     * Create an ECS cluster
     * By not providing a VPC we are creating a new VPC for this cluster
     */
    const cluster = new ecs.Cluster(this, 'cluster', {
      vpc,
      clusterName: 'um-demo',
      enableFargateCapacityProviders: true, // Allows usage of spot instances
    });

    vpc.node.addDependency(cluster);

    return cluster;
  }

  private setupLoadbalancer(vpc: ec2.IVpc) {

    // Import account hosted zone
    const accountRootZoneId = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneId);
    const accountRootZoneName = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneName);
    const accountRootZone = route53.HostedZone.fromHostedZoneAttributes(this, 'account-root-zone', {
      hostedZoneId: accountRootZoneId,
      zoneName: accountRootZoneName,
    });

    // Get a certificate
    const albWebFormsDomainName = `alb.${accountRootZoneName}`;
    const albCertificate = new acm.Certificate(this, 'loadbalancer-certificate', {
      domainName: albWebFormsDomainName,
      validation: acm.CertificateValidation.fromDns(accountRootZone),
    });


    // Construct the loadbalancer
    const loadbalancer = new loadbalancing.ApplicationLoadBalancer(this, 'loadbalancer', {
      vpc,
      internetFacing: true, // Expose to internet (not internal to vpc)
    });
    // Security hub finding, do not accept invalid http headers
    loadbalancer.setAttribute('routing.http.drop_invalid_header_fields.enabled', 'true');

    // Setup a https listner
    const listner = loadbalancer.addListener('https', {
      certificates: [albCertificate],
      protocol: loadbalancing.ApplicationProtocol.HTTPS,
      sslPolicy: loadbalancing.SslPolicy.FORWARD_SECRECY_TLS12_RES,
      defaultAction: loadbalancing.ListenerAction.fixedResponse(404, { messageBody: 'not found ALB' }),
    });

    new route53.ARecord(this, 'loadbalancer-a-record', {
      zone: accountRootZone,
      recordName: 'alb',
      target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(loadbalancer)),
      comment: 'webformulieren load balancer a record',
    });

    vpc.node.addDependency(loadbalancer);
    return listner;
  }

  private addHelloWorldContainer(cluster: ecs.Cluster, listner: loadbalancing.IApplicationListener) {

    const logGroup = new logs.LogGroup(this, 'hello-world-logs', {
      retention: RetentionDays.ONE_DAY, // Very short lived (no need to keep demo stuff)
    });

    /**
     * Setup the hello world task definition
     * Use minimal cpu and memory
     */
    const taskDef = new ecs.TaskDefinition(this, 'hello-world-task', {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '256',
      memoryMiB: '512',
    });

    /**
     * Add a simple hello-world container to the task definition
     */
    const dockerhub = secrets.Secret.fromSecretNameV2(this, 'dockerhub-secret', Statics.secretDockerHub);
    taskDef.addContainer('hello-world', {
      image: ecs.ContainerImage.fromRegistry('nginxdemos/hello', {
        credentials: dockerhub,
      }),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'logs',
        logGroup,
      }),
      portMappings: [{
        containerPort: 80,
      }],
    });

    /**
     * Define the service in the cluster
     */
    const service = new ecs.FargateService(this, 'hello-world-service', {
      cluster,
      serviceName: 'hello-world-service',
      taskDefinition: taskDef,
      desiredCount: 1,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT', // USE spot instances
          weight: 1,
        },
      ],
    });
    service.node.addDependency(cluster);


    listner.addTargets('hello-world-target', {
      port: 80,
      protocol: loadbalancing.ApplicationProtocol.HTTP,
      targets: [service],
      conditions: [
        //loadbalancing.ListenerCondition.pathPatterns([props.containerListenPath]),
        //loadbalancing.ListenerCondition.httpHeader('Custom-HTTP-Header', [statics.cloudfrontToAlbHeaderValue]),
      ],
      //priority: 10,
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
      //deregistrationDelay: Duration.minutes(1), //TODO check of dit niet te kort is ivm opstarttijd nieuwe container en lopende sessies.
    });

  }

}