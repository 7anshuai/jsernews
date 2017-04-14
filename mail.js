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

module.exports = {
  isValidEmail: isValidEmail
}
