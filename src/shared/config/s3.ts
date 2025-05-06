import AWS from 'aws-sdk';

// Configurar o cliente S3 (compatível com MinIO)
const s3Config: AWS.S3.ClientConfiguration = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
};

// Se estivermos usando MinIO localmente ou outro endpoint S3 compatível
if (process.env.AWS_S3_ENDPOINT) {
  s3Config.endpoint = process.env.AWS_S3_ENDPOINT;
  s3Config.s3ForcePathStyle = process.env.AWS_S3_FORCE_PATH_STYLE === 'true';
}

export const s3Client = new AWS.S3(s3Config);
export const bucketName = process.env.AWS_S3_BUCKET || 'broadcast-files';
