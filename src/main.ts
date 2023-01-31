import { App } from 'aws-cdk-lib';
import { ContainerClusterStack } from './ContainerCluster';
import { ParameterStack } from './ParameterStack';
import { Statics } from './Statics';

const app = new App();

const parameterStack = new ParameterStack(app, 'parameter-stack', {
  env: Statics.umDemoEnvironment,
  description: 'Parameters and secrets for um-demo',
});

const cluster = new ContainerClusterStack(app, 'cluster-stack', {
  env: Statics.umDemoEnvironment,
  description: 'ecs cluster and services for um-demo',
});
cluster.addDependency(parameterStack);

app.synth();