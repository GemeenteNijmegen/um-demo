import {
  Stack,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface DnsStackProps {

}

export class DnsStack extends Stack {

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    new s3.Bucket(this, 'test-bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

  }

}