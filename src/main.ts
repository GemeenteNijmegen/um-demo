import { App } from 'aws-cdk-lib';
import { ContainerClusterStack } from './ContainerCluster';
import { DnsStack } from './DnsStack';
import { Statics } from './Statics';

const app = new App();

new DnsStack(app, 'dns-stack', {
  env: Statics.umDemoEnvironment,
  description: 'DNS resources for um-demo',
});

new ContainerClusterStack(app, 'cluster-stack', {
  env: Statics.umDemoEnvironment,
  description: 'ecs cluster and services for um-demo',
});

app.synth();