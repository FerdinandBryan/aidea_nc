<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
        .card { background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: auto; }
        .btn { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        .footer { margin-top: 20px; font-size: 12px; color: #888; }
    </style>
</head>
<body>
    <div class="card">
        <h2>AIDEA - Password Reset</h2>
        <p>Hello,</p>
        <p>You requested to reset your password for your AIDEA account at Norzagaray College.</p>
        <p>Click the button below to reset your password. This link expires in <strong>60 minutes</strong>.</p>
        <a href="{{ $resetLink }}" class="btn">Reset My Password</a>
        <p>If you did not request this, please ignore this email.</p>
        <div class="footer">
            &copy; {{ date('Y') }} AIDEA - Norzagaray College. All rights reserved.
        </div>
    </div>
</body>
</html>
