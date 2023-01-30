import { Stack, StackProps, aws_secretsmanager as secrets } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Statics } from './Statics';


export class ParameterStack extends Stack {


  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new secrets.Secret(this, 'secret-dockerhub', {
      secretName: Statics.secretDockerHub,
    });

  }

}