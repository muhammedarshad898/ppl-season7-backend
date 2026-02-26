function validateImageData(data) {
  return !!data && typeof data === 'string' && data.startsWith('data:image');
}

module.exports = {
  validateImageData,
};
