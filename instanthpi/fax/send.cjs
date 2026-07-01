/**
 * instanthpi/fax/send.cjs
 *
 * Outbound fax via SRFax's REST API (Queue_Fax action), using the
 * self-hoster's own SRFax account. No shared/hosted fax infrastructure --
 * every physician brings their own SRFAX_ACCESS_ID/SRFAX_PWD/SRFAX_CALLER_ID.
 *
 * Reference: SRFax's "SRFax Web Services" API (POST JSON to
 * https://secure.srfax.com/SRF_SecWebSvc.php with an "action" field). This
 * client covers the two actions most front-ends need: Queue_Fax (send) and
 * Get_FaxStatus (check on a previously queued fax). Verify field names
 * against your SRFax account's current API documentation if a call fails
 * with an unexpected error -- SRFax occasionally adds optional fields.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRFAX_URL = 'https://secure.srfax.com/SRF_SecWebSvc.php';

function getCredentials(overrides = {}) {
  const accessId = overrides.accessId || process.env.SRFAX_ACCESS_ID;
  const accessPwd = overrides.accessPwd || process.env.SRFAX_PWD;
  const callerId = overrides.callerId || process.env.SRFAX_CALLER_ID;
  if (!accessId || !accessPwd) {
    throw new Error(
      'SRFAX_ACCESS_ID and SRFAX_PWD must be set (instanthpi/.env) to send a fax.',
    );
  }
  return { accessId, accessPwd, callerId };
}

/** SRFax expects a plain digit string for fax numbers -- strip everything
 * else (spaces, dashes, parentheses, a leading "+"). */
function normalizeFaxNumber(num) {
  return String(num).replace(/\D/g, '');
}

async function srfaxRequest(body) {
  const res = await fetch(SRFAX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(async () => {
    throw new Error(`SRFax returned a non-JSON response: ${await res.text()}`);
  });
  if (!res.ok || data.Status !== 'Success') {
    throw new Error(`SRFax ${body.action} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Send a single fax.
 *
 * @param {object} opts
 * @param {string} opts.toFaxNumber - destination fax number, any formatting.
 * @param {string} opts.filePath - path to the PDF (or other supported file)
 *   to send.
 * @param {string} [opts.fileName] - defaults to the basename of filePath.
 * @param {string} [opts.callerId] - overrides SRFAX_CALLER_ID for this send.
 * @param {string} [opts.senderEmail] - optional, for SRFax's own status emails.
 * @returns {Promise<object>} the parsed SRFax response.
 */
async function sendFax({ toFaxNumber, filePath, fileName, callerId, senderEmail }) {
  if (!toFaxNumber) throw new Error('toFaxNumber is required');
  if (!filePath) throw new Error('filePath is required');
  if (!fs.existsSync(filePath)) throw new Error(`No such file: ${filePath}`);

  const { accessId, accessPwd, callerId: defaultCallerId } = getCredentials({ callerId });
  const resolvedFileName = fileName || path.basename(filePath);
  const fileContent = fs.readFileSync(filePath).toString('base64');

  const body = {
    action: 'Queue_Fax',
    access_id: accessId,
    access_pwd: accessPwd,
    sCallerID: callerId || defaultCallerId || '',
    sSenderEmail: senderEmail || '',
    sFaxType: 'SINGLE',
    sToFaxNumber: normalizeFaxNumber(toFaxNumber),
    sFileName_1: resolvedFileName,
    sFileContent_1: fileContent,
  };

  return srfaxRequest(body);
}

/** Check the status of a previously queued fax by its SRFax-assigned id
 * (the `Result` field returned by sendFax()). */
async function getFaxStatus(faxDetailsId) {
  const { accessId, accessPwd } = getCredentials();
  return srfaxRequest({
    action: 'Get_FaxStatus',
    access_id: accessId,
    access_pwd: accessPwd,
    sFaxDetailsID: faxDetailsId,
  });
}

module.exports = { sendFax, getFaxStatus, normalizeFaxNumber };

// --- CLI: `node send.cjs <toFaxNumber> <filePath>` for a quick manual test ---
if (require.main === module) {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch (err) {
    // optional
  }
  const [toFaxNumber, filePath] = process.argv.slice(2);
  if (!toFaxNumber || !filePath) {
    console.log('Usage: node fax/send.cjs <toFaxNumber> <filePath>');
    process.exitCode = 1;
  } else {
    sendFax({ toFaxNumber, filePath })
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
      });
  }
}
