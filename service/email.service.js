import { 
  WELCOME_EMAIL_TEMPLATE,
  RESET_PASSWORD_CODE_EMAIL_TEMPLATE,
  RESET_PASSWORD_VERIFIED_EMAIL_TEMPLATE,
  CHANGE_PASSWORD_CODE_EMAIL_TEMPLATE,
  PASSWORD_CHANGED_VERIFIED_EMAIL_TEMPLATE
} from './email.template.js';
import { mailtrapClient, sender } from './mailtrap.js';

const sendEmail = async (to, subject, html) => {
  if (!to) throw new Error("Recipient email is required.");
  const recipient = [{ email: to }];

  try {
    const response = await mailtrapClient.send({
      from: sender,
      to: recipient,
      subject,
      html,
      category: subject,
    });
    console.log(`Email sent successfully to ${to}`, response);
  } catch (error) {
    console.error(`Error sending email to ${to}`, error);
    throw new Error(`Error sending email: ${error}`);
  }
};

// -------------------
// Template rendering
// -------------------
function renderTemplate(template, replacements) {
  let html = template;
  Object.entries(replacements).forEach(([key, val]) => {
    const re = new RegExp(`\\{${key}\\}`, 'g');
    html = html.replace(re, val);
  });
  return html;
}

// -------------------
// Email Service Functions
// -------------------

export const sendWelcomeEmail = async (to, name, supportEmail, loginUrl) => {
  const subject = "Welcome to Otaflick!";
  const replacements = {
    name,
    supportEmail,
    loginUrl,
    year: new Date().getFullYear().toString()
  };
  
  const html = renderTemplate(WELCOME_EMAIL_TEMPLATE, replacements);
  await sendEmail(to, subject, html);
};

export const sendResetPasswordCodeEmail = async (to, name, verificationCode, expiryTime, supportEmail) => {
  const subject = "Reset Your Otaflick Password";
  const replacements = {
    name,
    verificationCode,
    expiryTime,
    supportEmail,
    year: new Date().getFullYear().toString()
  };
  
  const html = renderTemplate(RESET_PASSWORD_CODE_EMAIL_TEMPLATE, replacements);
  await sendEmail(to, subject, html);
};

export const sendResetPasswordVerifiedEmail = async (to, name, resetPasswordUrl, supportEmail) => {
  const subject = "Password Reset Verified - Set New Password";
  const replacements = {
    name,
    resetPasswordUrl,
    supportEmail,
    year: new Date().getFullYear().toString()
  };
  
  const html = renderTemplate(RESET_PASSWORD_VERIFIED_EMAIL_TEMPLATE, replacements);
  await sendEmail(to, subject, html);
};

export const sendChangePasswordCodeEmail = async (to, name, verificationCode, expiryTime, supportEmail) => {
  const subject = "Verify Your Password Change";
  const replacements = {
    name,
    verificationCode,
    expiryTime,
    supportEmail,
    year: new Date().getFullYear().toString()
  };
  
  const html = renderTemplate(CHANGE_PASSWORD_CODE_EMAIL_TEMPLATE, replacements);
  await sendEmail(to, subject, html);
};

export const sendPasswordChangedVerifiedEmail = async (to, name, loginUrl, supportEmail) => {
  const subject = "Password Changed Successfully";
  const replacements = {
    name,
    loginUrl,
    supportEmail,
    year: new Date().getFullYear().toString()
  };
  
  const html = renderTemplate(PASSWORD_CHANGED_VERIFIED_EMAIL_TEMPLATE, replacements);
  await sendEmail(to, subject, html);
};

