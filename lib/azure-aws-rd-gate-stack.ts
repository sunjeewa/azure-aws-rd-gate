import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as cf from '@aws-cdk/aws-cloudformation';
import { InitElementType } from '@aws-cdk/aws-ec2/lib/private/cfn-init-internal';

export class AzureAwsRdGateStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC
    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "172.16.0.0/16",
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 20,
          subnetType: ec2.SubnetType.PUBLIC,
          name: "Public"
        }
      ]
    })

    // CloudFormation Init config
    const init: ec2.CloudFormationInit = ec2.CloudFormationInit.fromElements(
      ec2.InitFile.fromString(
        "c:\setup.ps1",
        `
# PS to setup the server. 
        <#
    .SYNOPSIS
        Configure a Remote Desktop Gateway jump (bastion) server
    
    .DESCRIPTION
        Uses the Remote Desktop Services PowerShell provider to create/install an RD-CAP and an RD-RAP. Also creates and exports a self-signed certificate for use on connecting clients
    
    .PARAMETER dnsName
        FQDN of the to-be-generated self-signed certificate
    
    .OUTPUTS
        Self-signed cert at $HOME/desktop/$dnsName.cert 
    
    .NOTES
        Remote Desktop Service role must exist on server before this script is run.
        This script adds non-AD local groups to RD-CAP and permits all accesses to back-end resources
#>


Import-Module RemoteDesktopServices

# Create a self-signed certificate. This MUST be installed in the client's Trusted Root store for RDP clients to be able to use it
$dnsName = "yourvmname.eastus.cloudapp.azure.com"
$x509Obj = New-SelfSignedCertificate -CertStoreLocation Cert:\LocalMachine\My -DnsName $dnsName

# Export the cert to the administrator's desktop for use on clients
$x509Obj | Export-Certificate -FilePath "C:\$HOME\$dnsName.cer" -Force -Type CERT

# Create RD-CAP with two user groups; defaults permit all device redirection. Might be worth tightening up in terms of security.
$capName = "RD-CAP-$(Get-Date -Format FileDateTimeUniversal)"

Set-Location RDS:\GatewayServer\SSLCertificate #Change to location where self-signed certificate is specified
Set-Item .\Thumbprint -Value $x509obj.Thumbprint # Update RDG with the thumprint of the self-signed cert.

# Create a new Connection Authorization Profile
New-Item -Path RDS:\GatewayServer\CAP -Name $capName -UserGroups @("administrators@BUILTIN"; "Remote Desktop Users@BUILTIN") -AuthMethod 1

# Create a new Resouce Authorization Profile with "ComputerGroupType" set to 2 to permit connections to any device
$rapName = "RD-RAP-$(Get-Date -Format FileDateTimeUniversal)"
New-Item -Path RDS:\GatewayServer\RAP -Name $rapName -UserGroups @("administrators@BUILTIN"; "Remote Desktop Users@BUILTIN") -ComputerGroupType 2
Restart-Service TSGateway # We're done; let's put everything into effect


        `,
      ),
    );

    // -- Shared Instance Profile
    const Role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })
    // Add Permission for SSM
    Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"))


    // Not in use
    const InstanceProfile = new iam.CfnInstanceProfile(this, "InstanceProfile", {
      roles: [Role.roleName],
      path: "/"
    })


    // -- RD gateway instance
    const rdGateway = new ec2.Instance(this, "rdGateway", {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      vpc: vpc,
      machineImage: new ec2.WindowsImage(ec2.WindowsVersion.WINDOWS_SERVER_2016_ENGLISH_FULL_BASE),
      role: Role,
      init: init
    })

    rdGateway.connections.allowFrom(ec2.Peer.ipv4("58.96.89.81/32"), ec2.Port.allTraffic(), "Allow all from trusted ip")

    new cdk.CfnOutput(this,"gatewayInstance",{
      value: rdGateway.instanceId
    })

  }
}
