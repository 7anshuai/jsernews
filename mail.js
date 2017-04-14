const Readable = require('stream').Readable;
const smtp = require('smtp-protocol');

// Check if an email is valid, in a not very future-proof way.
function isValidEmail(mail){
  // Characters allowed on name: 0-9a-Z-._ on host: 0-9a-Z-. on between: @
  if (!/^[0-9a-zA-Z\.\-\_\+]+\@[0-9a-zA-Z\.\-]+$/.test(mail)) return false;

  // Must start or end with alpha or num
  if (/^[^0-9a-zA-Z]|[^0-9a-zA-Z]$/.test(mail)) return false;

  // Name must end with alpha or num
  if (!/([0-9a-zA-Z]{1})\@./.test(mail)) return false;

  // Host must start with alpha or num
  if (!/.\@([0-9a-zA-Z]{1})/.test(mail)) return false;

  // Host must end with '.' plus 2 or 3 or 4 alpha for TopLevelDomain
  // (MUST be modified in future!)
  if (!/\.([a-zA-Z]{2,4})$/.test(mail)) return false;

  return true
}

// Send an email using the specified SMTP relay host.
//
// 'relay' is an IP address or hostname of an SMTP server.
// 'from' can be a string or a two elements array [name,address].
// 'to' is a comma separated list of recipients.
// 'subject' and 'body' are just strings.
//
// If opt[:html] is true a set of headers to send HTML emails are emitted.
//
// The function does not try to send emails to destination addresses that
// appear to be invald. If at least one error occurs sending the email, then
// false is returned and the operation aborted, otherwise true is returned.
async function sendMail(relay, from, to, subject, body, opt={}){
  let header = ''
  if (opt.html) {
    header += "MIME-Version: 1.0\r\n";
    header += "Content-type: text/html;";
    header += "charset=utf-8\r\n";
  }

  if (Array.isArray(from)) {
    header += "From: "+ from[0] + " <" + from[1] + ">";
    from = from[1];
  } else {
    header += "From: " + from;
  }


  let message = `
Subject: ${subject}

${body}
`;

  let status = true;
  let mails = []
  for (let m of to.split(',')) {
    if (m && isValidEmail(m)){
      let p = new Promise((resolve, reject) => {
        smtp.connect(relay, (mail) => {
          let s = new Readable();
          mail.helo();
          mail.from(from);
          mail.to(m);
          mail.data();
          s.push(message);
          s.push(null);
          s.pipe(mail.message((err, code, lines) => {
            if (err) return reject(err);
            resolve(code);
          }));
        });
      });
      mails.push(p);
    }
  }

  let results = await Promise.all(mails);
  for (let code of results) {
    if (code != 250) status = false;
  }
  return status;
}

module.exports = {
  isValidEmail: isValidEmail,
  sendMail: sendMail
}
