const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
    }
});

const PROJECT_ID = process.env.PROJECT_ID || 'default_project_id';

async function init() { 
    console.log('Executing script.js');
    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && rm -f package-lock.json && npm install && npm run build`);

    // Listen to standard output
    p.stdout.on('data', function (data) {
        console.log(data.toString());
    });

    // Listen to standard error (Fixed: changed p.stdout to p.stderr)
    p.stderr.on('data', function (data) {
        console.error('Stderr:', data.toString());
    });
 
    // Capture the exit code to know if the build failed
    p.on('close', async function (code) {
        if (code !== 0) {
            console.error(`Build process exited with code ${code}. Upload aborted.`);
            process.exit(1); // Stop the script entirely
        }

        console.log('Build Complete');
        const distFolderPath = path.join(__dirname, 'output', 'dist');
        
        // Safely check if the dist folder actually exists
        if (!fs.existsSync(distFolderPath)) {
            console.error(`Error: The directory ${distFolderPath} does not exist.`);
            console.error('Check if Vite is configured to output to a different directory (like "build") or if your code is in a subfolder.');
            process.exit(1);
        }

        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });

        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);
            if (fs.lstatSync(filePath).isDirectory()) continue; 

            console.log('uploading', filePath);

            const command = new PutObjectCommand({
                Bucket: 'pegasus-outputs',
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath) || 'application/octet-stream' // added fallback
            });

            await s3Client.send(command);
            console.log('uploaded', filePath); 
        }
        
        console.log('Done...'); 
    });
}

init();