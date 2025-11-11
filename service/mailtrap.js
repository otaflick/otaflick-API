import {MailtrapClient} from "mailtrap";
import dotenv from 'dotenv'

dotenv.config();

// Debug: Check if environment variables are loading
console.log(' Environment variables check:');
console.log('MAILTRAP_TOKEN exists:', !!process.env.MAILTRAP_TOKEN);
console.log('MAILTRAP_TOKEN value:', process.env.MAILTRAP_TOKEN ? '***' + process.env.MAILTRAP_TOKEN.slice(-4) : 'NOT SET');
console.log('All env vars starting with MAILTRAP:', Object.keys(process.env).filter(key => key.includes('MAILTRAP')));

if (!process.env.MAILTRAP_TOKEN) {
  console.error('CRITICAL: MAILTRAP_TOKEN is not set in environment variables');
  console.error('Please add MAILTRAP_TOKEN=your_token to your .env file');
}

export const mailtrapClient = new MailtrapClient({
  token: process.env.MAILTRAP_TOKEN
});

export const sender = {
  email: "noreply@strangehooligan.online",
  name: "Otaflick",
};