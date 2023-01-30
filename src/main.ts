import { App } from 'aws-cdk-lib';
import { ContainerClusterStack } from './ContainerCluster';
import { DnsStack } from './DnsStack';
import { Statics } from './Statics';

const app = new App();

new DnsStack(app, 'dns-stack', {
  env: Statics.umDemoEnvironment,
});

new ContainerClusterStack(app, 'cluster-stack', {
  env: Statics.umDemoEnvironment,
});

app.synth();