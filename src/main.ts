import { App } from 'aws-cdk-lib';
import { CertStack } from './CertStack';
import { ContainerClusterStack } from './ContainerCluster';
import { ParameterStack } from './ParameterStack';
import { Statics } from './Statics';

const app = new App();

const parameterStack = new ParameterStack(app, 'parameter-stack', {
  env: Statics.umDemoEnvironment,
  description: 'Parameters and secrets for um-demo',
});

const certificateStack = new CertStack(app, 'certificate-stack', {
  description: 'Certificates for um-demo',
  env: {
    account: Statics.umDemoEnvironment.account,
    region: 'us-east-1',
  },
});

const cluster = new ContainerClusterStack(app, 'cluster-stack', {
  env: Statics.umDemoEnvironment,
  description: 'ecs cluster and services for um-demo',
});
cluster.addDependency(certificateStack);
cluster.addDependency(parameterStack);

app.synth();