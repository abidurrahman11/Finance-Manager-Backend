const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../config/db");
const auth = require("../middleware/auth"); // for password changing
const { sendEmail } = require("../config/mailer");
require("dotenv").config();

const router = express.Router();

function generateAccessToken (userId) { // short lived
    return jwt.sign({id: userId}, process.env.JWT_SECRET, {expiresIn: "55m"});
}

function generateRefreshToken (userId) { // long lived
    return jwt.sign({id: userId}, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user (is_verified defaults to FALSE)
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password_hash: hashedPassword,
        is_verified: false
      },
      select: {
        id: true,
        name: true,
        email: true,
        is_verified: true
      }
    });

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save verification token
    await prisma.verificationToken.create({
      data: {
        user_id: newUser.id,
        token: verificationToken,
        expires_at: expiresAt
      }
    });

    // Send verification email
    const verificationLink = `${process.env.CLIENT_URL}/api/auth/verify-email/${verificationToken}`;

    await sendEmail({
      to: email,
      subject: "Verify Your Email Address",
      html: `
        <p>Hello ${name},</p>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${verificationLink}">${verificationLink}</a>
        <p>This link will expire in 24 hours.</p>
      `,
    });

    res.json({ ...newUser, message: "Registration successful. Please check your email to verify your account." });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error." + err });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email }
    });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if verified
    if (!user.is_verified) {
      return res.status(403).json({ message: "Please verify your email before logging in" });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Save refresh token
    await prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token: refreshToken
      }
    });

    res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error." + err });
  }
});

// Verify Email
router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;

    // Find token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token }
    });
    if (!verificationToken) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    if (verificationToken.expires_at < new Date()) {
      return res.status(400).json({ message: "Token expired" });
    }

    // Update user to verified
    await prisma.user.update({
      where: { id: verificationToken.user_id },
      data: { is_verified: true }
    });

    // Delete used token
    await prisma.verificationToken.delete({
      where: { token }
    });

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error." + err });
  }
});

// Resend Verification Email
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });
    if (!user) {
      return res.status(200).json({ message: "If the email exists and is not verified, a new verification link was sent" });
    }

    // Check if already verified (handle NULL or TRUE)
    if (user.is_verified === true) {
      return res.status(200).json({ message: "Email is already verified" });
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Remove old tokens
    await prisma.verificationToken.deleteMany({
      where: { user_id: user.id }
    });

    // Save new token
    await prisma.verificationToken.create({
      data: {
        user_id: user.id,
        token: verificationToken,
        expires_at: expiresAt
      }
    });

    // Send email
    const verificationLink = `${process.env.CLIENT_URL}/api/auth/verify-email/${verificationToken}`;

    await sendEmail({
      to: email,
      subject: "Verify Your Email Address",
      html: `
        <p>Hello ${user.name},</p>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${verificationLink}">${verificationLink}</a>
        <p>This link will expire in 24 hours.</p>
      `,
    });

    res.json({ message: "Verification email resent successfully" });
  } catch (err) {
    console.error("Resend verification error:", err.message, err.stack);
    res.status(500).json({ message: "Failed to resend verification email", error: err.message });
  }
});

// Get current user
router.get("/me", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        is_verified: true
      }
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error." + err });
  }
});

// Update profile (name only — email is immutable)
router.put("/me", auth, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== "string" || name.trim().length < 1) {
            return res.status(400).json({ message: "Name is required" });
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { name: name.trim() },
            select: {
                id: true,
                name: true,
                email: true,
                is_verified: true
            }
        });

        res.json(updatedUser);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Server error." + err });
    }
});

// Refresh token
router.post("/refresh", async (req, res) => {
    const {refreshToken} = req.body;
    if (!refreshToken) {
        return res.status(401).json({message: "no token provided"});
    }

    try {
        // check if token exist in db
        const tokenInDB = await prisma.refreshToken.findUnique({
          where: { token: refreshToken }
        });
        if (!tokenInDB) {
            return res.status(403).json({message: "invalid refresh token"});
        }

        // verify refresh token
        const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        // generate new access token
        const newAccessToken = generateAccessToken(payload.id);

        res.json({accessToken: newAccessToken});
    } catch (err) {
        res.status(403).json({message: "invalid or expired refresh token." + err});
    }
});

// Logout
router.post("/logout", async (req, res) => {
    const {refreshToken} = req.body;
    if (!refreshToken) {
        return res.status(400).json({ message: "No token provided" });
    }

    try {
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken }
        });
        res.json({message: "logged out successfully"});
    } catch(err) {
        console.error(err.message);
        res.status(500).send("server error." + err);
    }
});

// Change password
router.post("/change-password", auth, async(req, res) => {
    try {
        const {oldPassword, newPassword} = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({message: "old and new password are required"});
        }

        // find the user
        const user = await prisma.user.findUnique({
          where: { id: req.user.id }
        });
        if (!user) {
            return res.status(404).json({message: "user not found"});
        }

        // verify old password
        const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({message: "old password is incorrect"});
        }

        // hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // update password in db
        await prisma.user.update({
          where: { id: req.user.id },
          data: { password_hash: hashedPassword }
        });

        res.json({message: "password changed successfully"});
    } catch (err) {
        console.error(err.message);
        res.status(500).send("server error." + err);
    }
});

// Forgot password: send reset link
router.post("/forgot-password", async(req, res) => {
    try {
        const {email} = req.body;
        if (!email) {
            return res.status(400).json({message: "email is required"});
        }

        // find user
        const user = await prisma.user.findUnique({
          where: { email }
        });
        // if no user exist, avoid leaking valid email
        if (!user) {
            return res.status(200).json({message: "if that email exists, a reset link was sent"});
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour expiry

        // Remove old tokens for this user
        await prisma.passwordReset.deleteMany({
          where: { user_id: user.id }
        });

        // save token
        await prisma.passwordReset.create({
          data: {
            user_id: user.id,
            token: resetToken,
            expires_at: expiresAt
          }
        });

        // send email
        const resetLink = `${process.env.CLIENT_URL}/api/auth/reset-password/${resetToken}`;

        await sendEmail({
          to: email,
          subject: "Password Reset Request",
          html: `
            <p>Hello ${user.name},</p>
                <p>You requested to reset your password.</p>
                <p>Click the link below to reset:</p>
                <a href="${resetLink}">${resetLink}</a>
                <p>This link will expire in 1 hour.</p>
          `,
        });

        res.json({message: "If that email exists, a reset link was sent"});
    } catch (err) {
        console.error(err.message);
        res.status(500).send("server error." + err);
    }
});

// Reset password: verify token & update password
router.post("/reset-password/:token", async(req, res) => {
    try {
        const {token} = req.params;
        const {newPassword} = req.body;

        if (!newPassword) {
            return res.status(400).json({message: "new password required"});
        }

        // find token
        const reset = await prisma.passwordReset.findUnique({
          where: { token }
        });
        if (!reset) {
            return res.status(400).json({message: "invalid or expired token"});
        }

        if (reset.expires_at < new Date()) {
            return res.status(400).json({message: "token expired"});
        }

        // hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // update user password in db
        await prisma.user.update({
          where: { id: reset.user_id },
          data: { password_hash: hashedPassword }
        });

        // delete previously used token
        await prisma.passwordReset.delete({
          where: { id: reset.id }
        });

        res.json({message: "password reset successful"});
    } catch(err) {
        console.error(err.message);
        res.status(500).send("server error." + err);
    }
});

module.exports = router;
