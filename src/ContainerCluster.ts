import {
  Stack, Fn, Aws, StackProps,
  aws_ecs as ecs,
  aws_ssm as ssm,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as loadbalancing,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_certificatemanager as acm,
  aws_secretsmanager as secrets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcsFargateService } from './constructs/EcsFargateService';
import { Statics } from './Statics';

export interface ContainerClusterStackProps extends StackProps {

}

export class ContainerClusterStack extends Stack {

  constructor(scope: Construct, id: string, props: ContainerClusterStackProps) {
    super(scope, id, props);


    const vpc = this.setupVpc();
    const listner = this.setupLoadbalancer(vpc);
    const cluster = this.constructEcsCluster(vpc);

    this.addHelloWorldService(cluster, listner);
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


  private addHelloWorldService(cluster: ecs.Cluster, listner: loadbalancing.IApplicationListener) {
    const dockerhub = secrets.Secret.fromSecretNameV2(this, 'dockerhub-secret', Statics.secretDockerHub);
    new EcsFargateService(this, 'service-1', {
      serviceName: 'test',
      containerImage: 'nginxdemos/hello',
      containerPort: 80,
      ecsCluster: cluster,
      listner: listner,
      serviceListnerPath: '/*',
      desiredtaskcount: 1,
      dockerhubSecret: dockerhub,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
    });
  }

}