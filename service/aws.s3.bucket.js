const AWS = require('aws-sdk');
const dotenv = require('dotenv');
dotenv.config();

// Debug: Check if environment variables are loaded
console.log('=== AWS S3 Configuration ===');
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('AWS_BUCKET_NAME:', process.env.AWS_BUCKET_NAME);
console.log('AWS_ACCESS_KEY exists:', !!process.env.AWS_ACCESS_KEY);
console.log('AWS_SECRET_ACCESS_KEY exists:', !!process.env.AWS_SECRET_ACCESS_KEY);
console.log('============================');

// Configure AWS SDK with proper timeout settings
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  maxRetries: 3, // Add retry logic
  retryDelayOptions: { base: 300 } // Delay between retries
});

// Create S3 instance with proper configuration
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4',
  
  // CRITICAL: Add timeout configurations
  httpOptions: {
    timeout: 30000, // 30 seconds timeout
    connectTimeout: 10000, // 10 seconds connection timeout
    // Sometimes needed for network issues:
    agent: null
  },
  
  // Try different addressing styles if needed
  s3ForcePathStyle: false,
  
  // Disable accelerate endpoint (can cause issues)
  useAccelerateEndpoint: false
});

// Enhanced verification
console.log('S3 instance created successfully');
console.log('S3 upload method exists:', typeof s3.upload === 'function');
console.log('S3 putObject method exists:', typeof s3.putObject === 'function');

module.exports = s3;