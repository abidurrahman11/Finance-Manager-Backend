const brevo = require("@getbrevo/brevo");

const apiInstance = new brevo.TransactionalEmailsApi();

apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

async function sendEmail({ to, subject, html }) {
  return apiInstance.sendTransacEmail({
    sender: {
      name: "Finance Manager",
      email: process.env.EMAIL_FROM.match(/<(.*)>/)[1],
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  });
}

module.exports = { sendEmail };