import {
  Stack, Fn, Aws, StackProps,
  aws_ecs as ecs,
  aws_ssm as ssm,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as loadbalancing,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  Duration,
} from 'aws-cdk-lib';
import { AllowedMethods } from 'aws-cdk-lib/aws-cloudfront';
import { UlimitName } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { CloudfrontDistribution } from './constructs/CloudfrontDistribution';
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

    const distribution = this.setupCloudfront();

    // TODO I think order is important due to the addBehavior called on the CloudFront distribution
    this.addKeycloakService(cluster, listner, distribution);
    const gateway = this.addGatewayService(cluster, listner, distribution);
    this.addWebappService(cluster, listner, distribution);
    const elasticsearch = this.addElasticSearch(cluster);

    const werkzoekendeBron = this.addWerkzoekendeBron(cluster);
    elasticsearch.service.connections.allowFrom(werkzoekendeBron.service.connections, ec2.Port.tcp(9200));

    const werkzoekendeBemiddelaar = this.addWerkzoekendeBemiddelaar(cluster);
    elasticsearch.service.connections.allowFrom(werkzoekendeBemiddelaar.service.connections, ec2.Port.tcp(9200));
    werkzoekendeBemiddelaar.service.connections.allowFrom(gateway.service.connections, ec2.Port.tcp(8080));

    const vacaturesBron = this.addVacaturesBron(cluster);
    elasticsearch.service.connections.allowFrom(vacaturesBron.service.connections, ec2.Port.tcp(9200));
    vacaturesBron.service.connections.allowFrom(gateway.service.connections, ec2.Port.tcp(8080));

    const vacaturesBemiddelaar = this.addVacaturesBemiddelaar(cluster);
    elasticsearch.service.connections.allowFrom(vacaturesBemiddelaar.service.connections, ec2.Port.tcp(9200));
    vacaturesBemiddelaar.service.connections.allowFrom(gateway.service.connections, ec2.Port.tcp(8080));

    const adapter = this.addAdapterService(cluster);
    adapter.service.connections.allowFrom(gateway.service.connections, ec2.Port.tcp(8080));
    werkzoekendeBron.service.connections.allowFrom(adapter.service.connections, ec2.Port.tcp(8080));

  }

  private setupCloudfront() {
    const cf = new CloudfrontDistribution(this, 'cloudfront');
    return cf.distribution;
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

    cluster.addDefaultCloudMapNamespace({
      name: 'um-demo.local',
      vpc,
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

  addWebappService(cluster: ecs.Cluster, listner: loadbalancing.IApplicationListener, distribution: cloudfront.Distribution) {
    new EcsFargateService(this, 'webapp', {
      serviceName: 'webapp',
      containerImage: ecs.ContainerImage.fromRegistry('vngrci/web-applicatie'),
      containerPort: 8080,
      ecsCluster: cluster,
      listner: listner,
      serviceListnerPath: '/*',
      desiredtaskcount: 1,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 100, // Low in prio list as others may match
      cpu: '256',
      memoryMiB: '512',
      distribution,
      environment: {
        GATEWAY_URL: 'https://um-demo.csp-nijmegen.nl/gateway', // Cannot end with a / or frontend will make invalid paths
        KIBANA_URL: 'http://kibana',
        STRICT_DISCOVERY_DOCUMENT_VALIDATION: 'false',
        CLIENT_ID: 'um-demo-frontend',
        SCOPE: 'openid profile email offline_access',
        REQUIRE_HTTPS: 'true',
        JWT_ISSUER_URI: 'https://um-demo.csp-nijmegen.nl/auth/realms/um-demo-realm',
      },
    });
  }

  addKeycloakService(cluster: ecs.Cluster, listner: loadbalancing.IApplicationListener, distribution: cloudfront.Distribution) {
    new EcsFargateService(this, 'keycloak', {
      serviceName: 'keycloak',
      containerImage: ecs.ContainerImage.fromAsset('./src/containers/keycloak'),
      containerPort: 8080,
      ecsCluster: cluster,
      listner: listner,
      serviceListnerPath: '/auth/*',
      desiredtaskcount: 1,
      useSpotInstances: false,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 11,
      cpu: '512',
      memoryMiB: '1024',
      healthCheckGracePeriod: Duration.minutes(4), // Allow sufficient startup time for the container,
      healthCheckPath: '/auth/health',
      distribution,
      environment: {
        KC_PROXY: 'edge', // Allow http from loadbalancer to container and use X-Forwarded-* headers
        KC_HEALTH_ENABLED: 'true', // Enable health check for loadbalancer
        KC_HOSTNAME_STRICT: 'true', // Disables dynamically resolving the hostname from request headers
        KC_HOSTNAME_STRICT_BACKCHANNEL: 'true', // Disables dynamically resolving the hostname from request headers (for backchanel urls)
        KC_HTTP_RELATIVE_PATH: '/auth', // Run in container under /auth path
        KC_HOSTNAME_URL: 'https://um-demo.csp-nijmegen.nl/auth/', //Set the base URL for frontend URLs, including scheme, host, port and path.
        KC_HOSTNAME_ADMIN_URL: 'https://um-demo.csp-nijmegen.nl/auth/', // Set the base URL for frontend URLs, including scheme, host, port and path. (admin console)
      },
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
      allowedMethods: AllowedMethods.ALLOW_ALL,
    });
  }

  addGatewayService(cluster: ecs.Cluster, listner: loadbalancing.IApplicationListener, distribution: cloudfront.Distribution) {
    return new EcsFargateService(this, 'gateway', {
      serviceName: 'gateway',
      containerImage: ecs.ContainerImage.fromAsset('./src/containers/gateway'),
      containerPort: 8080,
      ecsCluster: cluster,
      listner: listner,
      serviceListnerPath: '/gateway/*',
      healthCheckPath: '/alive',
      desiredtaskcount: 1,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 12,
      cpu: '256',
      memoryMiB: '512',
      distribution,
      //runtimePlatform: {
      //  operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      //  cpuArchitecture: ecs.CpuArchitecture.X86_64,
      //},
      allowedMethods: AllowedMethods.ALLOW_ALL,
    });
  }

  addAdapterService(cluster: ecs.Cluster) {
    return new EcsFargateService(this, 'camel-adapter', {
      serviceName: 'camel-adapter',
      containerImage: ecs.ContainerImage.fromAsset('./src/containers/camel-adapter'),
      containerPort: 8080,
      ecsCluster: cluster,
      desiredtaskcount: 1,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 13,
      cpu: '256',
      memoryMiB: '512',
      allowedMethods: AllowedMethods.ALLOW_ALL,
      environment: {
        CA_SERVER_PORT: '8080',
        CA_SERVER_ADDRESS: '0.0.0.0',
        CA_BACKEND_URL: 'http://werkzoekende-bron.um-demo.local:8080/gateway', // Zonder /
      },
    });
  }

  addElasticSearch(cluster: ecs.Cluster) {
    return new EcsFargateService(this, 'elasticsearch', {
      serviceName: 'elasticsearch',
      containerImage: ecs.ContainerImage.fromRegistry('docker.elastic.co/elasticsearch/elasticsearch:7.17.8'),
      containerPort: 9200,
      ecsCluster: cluster,
      desiredtaskcount: 1,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 14,
      cpu: '512',
      memoryMiB: '1024',
      environment: {
        'TZ': 'Europe/Amsterdam',
        'cluster.name': 'um-demo-es-cluster',
        'node.name': 'node-1',
        'cluster.initial_master_nodes': 'node-1',
        'node.store.allow_mmap': 'false',
        'ES_JAVA_OPTS': '-Xms512m -Xmx512m',
      },
      ulimits: [
        {
          name: UlimitName.NOFILE,
          hardLimit: 65535,
          softLimit: 65535,
        },
      ],
    });
  }

  addWerkzoekendeBron(cluster: ecs.Cluster) {
    return new EcsFargateService(this, 'werkzoekende-bron', {
      serviceName: 'werkzoekende-bron',
      containerImage: ecs.ContainerImage.fromAsset('./src/containers/profielen-bron'),
      containerPort: 8080,
      ecsCluster: cluster,
      desiredtaskcount: 1,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 13,
      cpu: '256',
      memoryMiB: '512',
      environment: {
        BRW_SERVER_PORT: '8080',
        BRW_SERVER_ADDRESS: '0.0.0.0',
        BRW_LOGGING_LEVEL_COMMON_REQUEST: 'DEBUG',
        BRW_LOGGING_LEVEL: 'DEBUG',
        BRW_LOGGING_FILE_PATH: '.',
        BRW_LOGGING_FILE_NAME: 'app.log',
        BRW_JWT_ISSUER_URI: 'https://um-demo.csp-nijmegen.nl/auth/realms/um-demo-realm',
        BRW_CONSOLE_ENABLED: 'true',
        BRW_DATASOURCE_URL: 'jdbc:h2:./werkzoekende-bemiddelaar;DB_CLOSE_ON_EXIT=FALSE;AUTO_RECONNECT=TRUE',
        BRW_DATASOURCE_DRIVER: 'org.h2.Driver',
        BRW_DATASOURCE_USERNAME: 'sa',
        BRW_DATASOURCE_PASSWORD: '',
        BRW_DATABASE_PLATFORM: 'org.hibernate.dialect.H2Dialect',
        BRW_HIBERNATE_DDL: 'update',
        BRW_ELASTICSEARCH_URL: 'elasticsearch.um-demo.local:9200',
        BRW_MAX_AMOUNT_RESPONSE: '100',
      },
    });
  }

  addWerkzoekendeBemiddelaar(cluster: ecs.Cluster) {
    return new EcsFargateService(this, 'werkzoekende-bemiddelaar', {
      serviceName: 'werkzoekende-bemiddelaar',
      containerImage: ecs.ContainerImage.fromAsset('./src/containers/profielen-bemiddelaar'),
      containerPort: 8080,
      ecsCluster: cluster,
      desiredtaskcount: 1,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 14,
      cpu: '256',
      memoryMiB: '512',
      environment: {
        BMW_SERVER_PORT: '8080',
        BMW_SERVER_ADDRESS: '0.0.0.0',
        BMW_LOGGING_LEVEL_COMMON_REQUEST: 'DEBUG',
        BMW_LOGGING_LEVEL: 'DEBUG',
        BMW_LOGGING_FILE_PATH: '.',
        BMW_LOGGING_FILE_NAME: 'app.log',
        BMW_JWT_ISSUER_URI: 'https://um-demo.csp-nijmegen.nl/auth/realms/um-demo-realm',
        BMW_CONSOLE_ENABLED: 'true',
        BMW_DATASOURCE_URL: 'jdbc:h2:./werkzoekende-bemiddelaar;DB_CLOSE_ON_EXIT=FALSE;AUTO_RECONNECT=TRUE',
        BMW_DATASOURCE_DRIVER: 'org.h2.Driver',
        BMW_DATASOURCE_USERNAME: 'sa',
        BMW_DATASOURCE_PASSWORD: '',
        BMW_DATABASE_PLATFORM: 'org.hibernate.dialect.H2Dialect',
        BMW_HIBERNATE_DDL: 'update',
        BMW_DAYS_TO_EXPIRE: '7',
        BMW_MAX_DETAIL_PROFILES: '10',
        BMW_CALLBACK_URL_BEMIDDELAAR: 'https://um-demo.csp-nijmegen.nl/gateway/aanvraagwerkzoekende/callback',
        BMW_VUM_URL_MATCHES: 'https://profiel-stub.testdorp.nl/api/v1/werkzoekendeProfielen/matches',
        BMW_VUM_ID_URL: 'https://profiel-stub.testdorp.nl/api/v1/werkzoekendeProfielen/',
        BMW_ELASTICSEARCH_URL: 'elasticsearch.um-demo.local:9200',
      },
    });
  }

  addVacaturesBron(cluster: ecs.Cluster) {
    return new EcsFargateService(this, 'vacatures-bron', {
      serviceName: 'vacatures-bron',
      containerImage: ecs.ContainerImage.fromAsset('./src/containers/vacatures-bron'),
      containerPort: 8080,
      ecsCluster: cluster,
      desiredtaskcount: 1,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 14,
      cpu: '256',
      memoryMiB: '512',
      environment: {
        BRV_SERVER_PORT: '8080',
        BRV_SERVER_ADDRESS: '0.0.0.0',
        BRV_LOGGING_LEVEL_COMMON_REQUEST: 'DEBUG',
        BRV_LOGGING_LEVEL: 'DEBUG',
        BRV_LOGGING_FILE_PATH: '.',
        BRV_LOGGING_FILE_NAME: 'app.log',
        BRV_JWT_ISSUER_URI: 'https://um-demo.csp-nijmegen.nl/auth/realms/um-demo-realm',
        BRV_CONSOLE_ENABLED: 'true',
        BRV_DATASOURCE_URL: 'jdbc:h2:./vacatures-bron;DB_CLOSE_ON_EXIT=FALSE;AUTO_RECONNECT=TRUE',
        BRV_DATASOURCE_DRIVER: 'org.h2.Driver',
        BRV_DATASOURCE_USERNAME: 'sa',
        BRV_DATASOURCE_PASSWORD: '',
        BRV_DATABASE_PLATFORM: 'org.hibernate.dialect.H2Dialect',
        BRV_HIBERNATE_DDL: 'update',
        BRV_MAX_AMOUNT_RESPONSE: '100',
        BRV_ELASTICSEARCH_URL: 'elasticsearch.um-demo.local:9200',
      },
    });
  }

  addVacaturesBemiddelaar(cluster: ecs.Cluster) {
    return new EcsFargateService(this, 'vacatures-bemiddelaar', {
      serviceName: 'vacatures-bemiddelaar',
      containerImage: ecs.ContainerImage.fromAsset('./src/containers/vacatures-bemiddelaar'),
      containerPort: 8080,
      ecsCluster: cluster,
      desiredtaskcount: 1,
      useSpotInstances: true,
      cloudfrontOnlyAccessToken: Statics.cloudfrontAlbAccessToken,
      priority: 14,
      cpu: '256',
      memoryMiB: '512',
      environment: {
        BMV_SERVER_PORT: '8080',
        BMV_SERVER_ADDRESS: '0.0.0.0',
        BMV_LOGGING_LEVEL_COMMON_REQUEST: 'DEBUG',
        BMV_LOGGING_LEVEL: 'DEBUG',
        BMV_LOGGING_FILE_PATH: '.',
        BMV_LOGGING_FILE_NAME: 'app.log',
        BMV_JWT_ISSUER_URI: 'https://um-demo.csp-nijmegen.nl/auth/realms/um-demo-realm',
        BMV_CONSOLE_ENABLED: 'true',
        BMV_DATASOURCE_URL: 'jdbc:h2:./vacatures-bemiddelaar;DB_CLOSE_ON_EXIT=FALSE;AUTO_RECONNECT=TRUE',
        BMV_DATASOURCE_DRIVER: 'org.h2.Driver',
        BMV_DATASOURCE_USERNAME: 'sa',
        BMV_DATASOURCE_PASSWORD: '',
        BMV_DATABASE_PLATFORM: 'org.hibernate.dialect.H2Dialect',
        BMV_HIBERNATE_DDL: 'update',
        BMV_DAYS_TO_EXPIRE: '7',
        BMV_MAX_DETAIL_PROFILES: '10',
        BMV_CALLBACK_URL_BEMIDDELAAR: 'https://um-demo.csp-nijmegen.nl/gateway/aanvraagvacature/callback',
        BMV_VUM_URL_MATCHES: 'https://vacature-stub.testdorp.nl/api/v1/vacatures/matches',
        BMV_VUM_ID_URL: 'https://vacature-stub.testdorp.nl/api/v1/vacatures/',
        BMV_ELASTICSEARCH_URL: 'elasticsearch.um-demo.local:9200',
      },
    });
  }

}