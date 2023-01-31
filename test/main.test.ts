import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ContainerClusterStack } from '../src/ContainerCluster';

test('Snapshot', () => {
  const app = new App();

  const stack = new ContainerClusterStack(app, 'dns-stack', {
    env: {
      account: '123456789012',
      region: 'eu-west-1',
    },
  });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});