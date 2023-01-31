import { App } from 'aws-cdk-lib';
import { CertStack } from './CertStack';
import { CloudfrontStack } from './CloudfrontStack';
import { ContainerClusterStack } from './ContainerCluster';
import { ParameterStack } from './ParameterStack';
import { Statics } from './Statics';

const app = new App();

const parameterStack = new ParameterStack(app, 'parameter-stack', {
  env: Statics.umDemoEnvironment,
  description: 'Parameters and secrets for um-demo',
});

const certificateStack = new CertStack(app, 'certificate-stack', {
  env: {
    account: Statics.umDemoEnvironment.account,
    region: 'us-east-1',
  },
});

const cloudfrontStack = new CloudfrontStack(app, 'cloudfront-stack', {
  env: Statics.umDemoEnvironment,
});
cloudfrontStack.addDependency(certificateStack);

const cluster = new ContainerClusterStack(app, 'cluster-stack', {
  env: Statics.umDemoEnvironment,
  description: 'ecs cluster and services for um-demo',
});
cluster.addDependency(cloudfrontStack);
cluster.addDependency(parameterStack);

app.synth();