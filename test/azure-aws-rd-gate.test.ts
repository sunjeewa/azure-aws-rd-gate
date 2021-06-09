import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as AzureAwsRdGate from '../lib/azure-aws-rd-gate-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new AzureAwsRdGate.AzureAwsRdGateStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
