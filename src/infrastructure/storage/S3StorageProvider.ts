import { s3Client, bucketName } from '../../shared/config/s3';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

export class S3StorageProvider {
  /**
   * Faz upload de um buffer para o S3
   */
  async uploadBuffer(
    buffer: Buffer, 
    key: string, 
    contentType: string = 'application/octet-stream'
  ): Promise<string> {
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType
    };
    
    const result = await s3Client.upload(params).promise();
    return result.Location;
  }
  
  /**
   * Faz upload de um arquivo do sistema de arquivos para o S3
   */
  async uploadFile(
    filePath: string, 
    key: string, 
    contentType: string = 'application/octet-stream'
  ): Promise<string> {
    const fileStream = createReadStream(filePath);
    
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
      ContentType: contentType
    };
    
    const result = await s3Client.upload(params).promise();
    return result.Location;
  }
  
  /**
   * Faz upload de um stream para o S3
   */
  async uploadStream(
    stream: Readable, 
    key: string, 
    contentType: string = 'application/octet-stream'
  ): Promise<string> {
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: stream,
      ContentType: contentType
    };
    
    const result = await s3Client.upload(params).promise();
    return result.Location;
  }
  
  /**
   * Obtém um arquivo do S3
   */
  async getFile(key: string): Promise<Buffer> {
    const params = {
      Bucket: bucketName,
      Key: key
    };
    
    const data = await s3Client.getObject(params).promise();
    return data.Body as Buffer;
  }
  
  /**
   * Obtém a URL de download para um arquivo
   */
  getSignedUrl(key: string, expiresIn: number = 3600): string {
    const params = {
      Bucket: bucketName,
      Key: key,
      Expires: expiresIn
    };
    
    return s3Client.getSignedUrl('getObject', params);
  }
  
  /**
   * Verifica se um arquivo existe no S3
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await s3Client.headObject({
        Bucket: bucketName,
        Key: key
      }).promise();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Remove um arquivo do S3
   */
  async deleteFile(key: string): Promise<void> {
    const params = {
      Bucket: bucketName,
      Key: key
    };
    
    await s3Client.deleteObject(params).promise();
  }
}
