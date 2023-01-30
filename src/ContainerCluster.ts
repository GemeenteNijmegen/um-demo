import {
  Stack,
  aws_ecs as ecs,
  aws_ssm as ssm,
  aws_ec2 as ec2,
  Fn, Aws,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface ContainerClusterStackProps {

}

export class ContainerClusterStack extends Stack {

  constructor(scope: Construct, id: string, props: ContainerClusterStackProps) {
    super(scope, id, props);

    const vpc = this.setupVpc();
    const cluster = this.constructEcsCluster(vpc);
    this.addHelloWorldContainer(cluster);
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

    return cluster;
  }


  private addHelloWorldContainer(cluster: ecs.Cluster) {

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
    taskDef.addContainer('hello-world', {
      image: ecs.ContainerImage.fromRegistry('hallo-world'),
    });

    /**
     * Define the service in the cluster
     */
    new ecs.FargateService(this, 'hello-world-service', {
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

  }

}