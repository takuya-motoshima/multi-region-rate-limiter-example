/**
 * Wait for specified milliseconds.
 * @param {number} ms milliseconds.
 * @return {Promise<void>}
 */
module.exports = async ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
}