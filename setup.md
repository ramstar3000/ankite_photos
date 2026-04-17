# AWS & Deployment Setup Guide

## Prerequisites

- AWS account with admin access
- AWS CLI configured locally (`aws configure`)
- GitHub account

## 1. Create S3 Bucket

```bash
aws s3 mb s3://ankita-photos-upload --region us-east-1
```

### Configure CORS

Save this as `cors.json`:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": [
      "https://YOUR_USERNAME.github.io",
      "http://localhost:8000",
      "http://127.0.0.1:8000"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Apply it:

```bash
aws s3api put-bucket-cors --bucket ankita-photos-upload --cors-configuration file://cors.json
```

> Keep "Block all public access" ON. The bucket is write-only from the browser.

## 2. Create Cognito Identity Pool

1. Go to **AWS Console > Cognito > Identity Pools > Create identity pool**
2. Name: `ankita-photos-pool`
3. Check **Enable access to unauthenticated identities**
4. Click **Create Pool**
5. On the next screen, Cognito creates two IAM roles. Note the **unauthenticated role name**
6. Copy the **Identity Pool ID** (e.g., `us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

## 3. Configure IAM Policy

Attach this inline policy to the **unauthenticated role**:

```bash
aws iam put-role-policy \
  --role-name Cognito_ankita_photos_poolUnauth_Role \
  --policy-name S3UploadOnly \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:PutObject"],
        "Resource": "arn:aws:s3:::ankita-photos-upload/uploads/*"
      }
    ]
  }'
```

> This only allows uploading to the `uploads/` prefix. No read, list, or delete.

## 4. Update app.js

Edit the `CONFIG` object in `app.js`:

```javascript
const CONFIG = {
  REGION: "us-east-1",                          // your region
  IDENTITY_POOL_ID: "us-east-1:xxxx-xxxx-...",  // from step 2
  BUCKET: "ankita-photos-upload",                // your bucket name
  PREFIX: "uploads/",
  PASSWORD: "your-password-here",                // the code guests will enter
  MAX_FILE_SIZE_MB: 50,
};
```

## 5. Test Locally

```bash
cd ankita_photos
python -m http.server 8000
```

Open `http://localhost:8000` and test the full flow.

## 6. Deploy to GitHub Pages

```bash
git init
git add index.html style.css app.js .gitignore setup.md
git commit -m "Initial photo upload site"
git remote add origin https://github.com/YOUR_USERNAME/ankita-photos.git
git branch -M main
git push -u origin main
```

Then in GitHub:
1. Go to **Settings > Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Save

Your site will be live at `https://YOUR_USERNAME.github.io/ankita-photos/`

## 7. Update CORS with Production URL

After GitHub Pages is live, update `cors.json` `AllowedOrigins` to include your actual GitHub Pages URL, then re-apply:

```bash
aws s3api put-bucket-cors --bucket ankita-photos-upload --cors-configuration file://cors.json
```

## 8. Generate QR Code

Use any QR code generator (e.g., https://www.qrcode-monkey.com/) with your GitHub Pages URL. Save the image for printing/sharing.

## Troubleshooting

**CORS errors in console**: Check that `AllowedOrigins` in S3 CORS matches exactly (protocol + domain, no trailing slash).

**"Access Denied" on upload**: Verify the Cognito Identity Pool ID is correct in `app.js` and the IAM policy is attached to the unauthenticated role.

**Files not appearing in S3**: Check the bucket name and prefix in `app.js`. Files will be under `uploads/` in the bucket.

**Large file failures**: The default max is 50 MB. For larger files, you'd need multipart uploads (requires `@aws-sdk/lib-storage`).
