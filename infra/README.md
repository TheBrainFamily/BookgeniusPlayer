## Requirement
- you need to have Docker installed
- you need to have AWS CLI installed


## Preparing deployment
 - setup .env in project root directory, replace any <YOUR_*> with your configuration. Any other can stay as it is.

```
CDK_DEFAULT_ACCOUNT=<YOUR_AWS_ACCOUNT_ID>
CF_PRIVATE_KEY_SECRET_NAME=bookgenius/cf/privateKey
JWT_PRIVATE_KEY_SECRET_NAME=bookgenius/jwt/privateKey
PRIVATE_JWT_KEY_NAME=private-jwt-key.pem
PUBLIC_JWT_KEY_NAME=public-jwt-key.pem
PRIVATE_CF_KEY_NAME=private-cf-key.pem
PUBLIC_CF_KEY_NAME=public-cf-key.pem
DOMAIN=<YOUR_DOMAIN_NAME>
CONTENT_BUCKET_NAME=webcontent.<YOUR_DOMAIN_NAME>
GEMINI_KEY=<YOUR_GEMINI_KEY>
```
`CDK_DEFAULT_ACCOUNT` - AWS Account ID (eg. 12345678910)<br/><br/>
`CF_PRIVATE_KEY_SECRET_NAME` - Name of the Secret where Cloudfront key will be stored<br/><br/>
`JWT_PRIVATE_KEY_SECRET_NAME` - Name of the Secret where JWT key will be stored<br/><br/>
`PRIVATE_JWT_KEY_NAME` - Name of JWT private key. If you have one place it on project root directory and change name to it.
Ff you don't have a key leave it as default and later you can generate it using `pnpm generate-key:jwt` command.<br/><br/>
`PUBLIC_JWT_KEY_NAME` - Name of JWT public key. If you have one place it on project root directory and change name to it.
Ff you don't have a key leave it as default and later you can generate it using `pnpm generate-key:jwt` command.<br/><br/>
`PRIVATE_CF_KEY_NAME` - Name of CloudFront private key. If you have one place it on project root directory and change name to it.
Ff you don't have a key leave it as default and later you can generate it using `pnpm generate-key:cf` command.<br/><br/>
`PUBLIC_CF_KEY_NAME` - Name of CloudFront public key. If you have one place it on project root directory and change name to it.
Ff you don't have a key leave it as default and later you can generate it using `pnpm generate-key:cf` command.<br/><br/>
`DOMAIN` - Your domain name (eg. bookgenius.net). You need to have this domain name setup on AWS Route53 first.<br/><br/>
`CONTENT_BUCKET_NAME` - Name of the S3 bucket for all assets. The bucket will be created on first deployment. 
Should be webcontent.yourdomainname.com (eg. webcontent.bookgenius.net)
`GEMINI_KEY` - Value of your gemini key 


## Available scripts

### Step 1
- If you don't have own CF and JWT keys run this command<br/>
 `pnpm generate-keys`<br/><br/>

- If you don't have only own CF keys run this command<br/> 
 `generate-key:cf`<br/><br/>
 
- If you don't have only own JWT keys run this command<br/> 
 `generate-key:jwt`<br/><br/> 

### Step 2
- Upload your keys to AWS:<br/>
`AWS_REGION=us-east-1 pnpm create-aws-keys` for cloudfront access

- Upload your key used by API server to proper AWS Region:<br/>
 `AWS_REGION=eu-central-1 pnpm create-aws-key:cf`<br/>
 Repeat this step for every API instance in different regions
 
### Step 3
 
- Load your `.env` file to terminal environment:<br/>
 `set -a; . ../.env;`
 
- Check CDK configuration:<br/>
 `pnpm synth`

- Make sure you have Docker up and running and run:<br/>
`pnpm run deploy`