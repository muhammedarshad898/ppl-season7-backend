function avatarUrl(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d1117&color=00e87a&size=400&bold=true&font-size=0.35`;
}

function sanitizeConfig(config) {
  return { ...config, adminPassword: undefined };
}

module.exports = {
  avatarUrl,
  sanitizeConfig,
};
