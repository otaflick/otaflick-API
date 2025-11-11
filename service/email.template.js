export const WELCOME_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to Otaflick</title>
  <style>
    html, body {margin:0; padding:0; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:#0f172a}
    .wrap {max-width:600px; margin:40px auto; padding:0 20px}
    .card {background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 20px 40px rgba(0,194,255,0.08); border:1px solid #f1f5f9}
    .banner {padding:32px; background:linear-gradient(135deg,#00C2FF,#0099CC); text-align:center}
    .brand {font-weight:700; color:#fff; font-size:28px; margin:0; letter-spacing:-0.5px}
    .body {padding:40px 32px}
    .greeting {margin:0 0 24px; font-size:20px; color:#0f172a; font-weight:600}
    .lead {margin:0 0 24px; color:#475569; line-height:1.6; font-size:16px}
    .divider {height:1px; background:#f1f5f9; margin:32px 0}
    .small {font-size:14px; color:#64748b; margin-top:8px; line-height:1.5}
    .footer {padding:24px 32px; background:#f8fafc; border-top:1px solid #f1f5f9; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <h1 class="brand">Otaflick</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi,</p>

        <p class="lead">
          Welcome to Otaflick! We're excited to have you on board. Your account has been successfully created and you're ready to start exploring our streaming platform.
        </p>

        <p class="lead">
          Get ready to discover thousands of movies, TV shows, and exclusive content tailored just for you.
        </p>

        <div class="divider"></div>

        <p class="small">
          Need help? Contact our support team at <a href="mailto:otaflick@gmail.com" style="color:#00C2FF;text-decoration:none">otaflick@gmail.com</a>.
        </p>
      </div>

      <div class="footer">
        © ${new Date().getFullYear()} Otaflick. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const RESET_PASSWORD_CODE_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset Your Password</title>
  <style>
    html, body {margin:0; padding:0; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:#0f172a}
    .wrap {max-width:600px; margin:40px auto; padding:0 20px}
    .card {background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 20px 40px rgba(0,194,255,0.08); border:1px solid #f1f5f9}
    .banner {padding:32px; background:linear-gradient(135deg,#00C2FF,#0099CC); text-align:center}
    .brand {font-weight:700; color:#fff; font-size:28px; margin:0; letter-spacing:-0.5px}
    .body {padding:40px 32px}
    .greeting {margin:0 0 24px; font-size:20px; color:#0f172a; font-weight:600}
    .lead {margin:0 0 24px; color:#475569; line-height:1.6; font-size:16px}
    .code {font-size:42px; font-weight:700; text-align:center; letter-spacing:12px; margin:40px 0; color:#0f172a; background:#f8fafc; padding:24px; border-radius:12px; border:2px dashed #00C2FF}
    .small {font-size:14px; color:#64748b; margin-top:8px; line-height:1.5}
    .divider {height:1px; background:#f1f5f9; margin:32px 0}
    .footer {padding:24px 32px; background:#f8fafc; border-top:1px solid #f1f5f9; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <h1 class="brand">Otaflick</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi,</p>

        <p class="lead">
          We received a request to reset your password. Use the verification code below to proceed with resetting your password.
        </p>

        <div class="code">{verificationCode}</div>

        <p class="small">
          This code will expire in {expiryTime} minutes. If you didn't request this reset, please ignore this email.
        </p>

        <div class="divider"></div>

        <p class="small">
          For security reasons, please do not share this code with anyone.
        </p>
      </div>

      <div class="footer">
        © ${new Date().getFullYear()} Otaflick. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const RESET_PASSWORD_VERIFIED_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset Password Verified</title>
  <style>
    html, body {margin:0; padding:0; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:#0f172a}
    .wrap {max-width:600px; margin:40px auto; padding:0 20px}
    .card {background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 20px 40px rgba(0,194,255,0.08); border:1px solid #f1f5f9}
    .banner {padding:32px; background:linear-gradient(135deg,#00C2FF,#0099CC); text-align:center}
    .brand {font-weight:700; color:#fff; font-size:28px; margin:0; letter-spacing:-0.5px}
    .body {padding:40px 32px}
    .greeting {margin:0 0 24px; font-size:20px; color:#0f172a; font-weight:600}
    .lead {margin:0 0 24px; color:#475569; line-height:1.6; font-size:16px}
    .divider {height:1px; background:#f1f5f9; margin:32px 0}
    .small {font-size:14px; color:#64748b; margin-top:8px; line-height:1.5}
    .footer {padding:24px 32px; background:#f8fafc; border-top:1px solid #f1f5f9; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <h1 class="brand">Otaflick</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi,</p>

        <p class="lead">
          Your identity has been successfully verified. You can now proceed to create a new password for your Otaflick account.
        </p>

        <p class="lead">
          Click the button in the app to set your new password and regain access to your account.
        </p>

        <div class="divider"></div>

        <p class="small">
          If you didn't request this verification, please contact support immediately at <a href="mailto:otaflick@gmail.com" style="color:#00C2FF;text-decoration:none">otaflick@gmail.com</a>.
        </p>
      </div>

      <div class="footer">
        © ${new Date().getFullYear()} Otaflick. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const CHANGE_PASSWORD_CODE_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Change Password Verification</title>
  <style>
    html, body {margin:0; padding:0; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:#0f172a}
    .wrap {max-width:600px; margin:40px auto; padding:0 20px}
    .card {background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 20px 40px rgba(0,194,255,0.08); border:1px solid #f1f5f9}
    .banner {padding:32px; background:linear-gradient(135deg,#00C2FF,#0099CC); text-align:center}
    .brand {font-weight:700; color:#fff; font-size:28px; margin:0; letter-spacing:-0.5px}
    .body {padding:40px 32px}
    .greeting {margin:0 0 24px; font-size:20px; color:#0f172a; font-weight:600}
    .lead {margin:0 0 24px; color:#475569; line-height:1.6; font-size:16px}
    .code {font-size:42px; font-weight:700; text-align:center; letter-spacing:12px; margin:40px 0; color:#0f172a; background:#f8fafc; padding:24px; border-radius:12px; border:2px dashed #00C2FF}
    .small {font-size:14px; color:#64748b; margin-top:8px; line-height:1.5}
    .divider {height:1px; background:#f1f5f9; margin:32px 0}
    .footer {padding:24px 32px; background:#f8fafc; border-top:1px solid #f1f5f9; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <h1 class="brand">Otaflick</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi,</p>

        <p class="lead">
          You've requested to change your password. To complete this process, please use the verification code below:
        </p>

        <div class="code">{verificationCode}</div>

        <p class="small">
          This code will expire in {expiryTime} minutes. Enter this code in the app to verify your identity and set a new password.
        </p>

        <div class="divider"></div>

        <p class="small">
          If you didn't initiate this password change, please secure your account and contact support immediately.
        </p>
      </div>

      <div class="footer">
        © ${new Date().getFullYear()} Otaflick. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const PASSWORD_CHANGED_VERIFIED_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Password Changed Successfully</title>
  <style>
    html, body {margin:0; padding:0; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:#0f172a}
    .wrap {max-width:600px; margin:40px auto; padding:0 20px}
    .card {background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 20px 40px rgba(0,194,255,0.08); border:1px solid #f1f5f9}
    .banner {padding:32px; background:linear-gradient(135deg,#00C2FF,#0099CC); text-align:center}
    .brand {font-weight:700; color:#fff; font-size:28px; margin:0; letter-spacing:-0.5px}
    .body {padding:40px 32px}
    .greeting {margin:0 0 24px; font-size:20px; color:#0f172a; font-weight:600}
    .lead {margin:0 0 24px; color:#475569; line-height:1.6; font-size:16px}
    .divider {height:1px; background:#f1f5f9; margin:32px 0}
    .small {font-size:14px; color:#64748b; margin-top:8px; line-height:1.5}
    .footer {padding:24px 32px; background:#f8fafc; border-top:1px solid #f1f5f9; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <h1 class="brand">Otaflick</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi,</p>

        <p class="lead">
          Your password has been changed successfully. You can now log in to your Otaflick account with your new password.
        </p>

        <p class="lead">
          If you made this change, no further action is required. You're all set to continue enjoying your streaming experience.
        </p>

        <div class="divider"></div>

        <p class="small">
          If you did not perform this change, immediately contact our support team at <a href="mailto:otaflick@gmail.com" style="color:#00C2FF;text-decoration:none">otaflick@gmail.com</a> to secure your account.
        </p>
      </div>

      <div class="footer">
        © ${new Date().getFullYear()} Otaflick. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();