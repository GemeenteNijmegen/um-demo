import { App } from 'aws-cdk-lib';
import { DnsStack } from './DnsStack';
import { Statics } from './Statics';

const app = new App();

new DnsStack(app, 'dns-stack', {
  env: Statics.umDemoEnvironment,
});

app.synth();