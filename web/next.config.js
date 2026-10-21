/** @type {import('next').NextConfig} */
const defaultApiServerBase =
	process.env.NODE_ENV === "production"
		? "https://api.muslimprofession.org"
		: "http://127.0.0.1:3000";

const apiServerBase = (process.env.API_SERVER_BASE_URL || defaultApiServerBase).replace(/\/+$/, "");

module.exports = {
	reactStrictMode: true,
	poweredByHeader: false,
	async rewrites() {
		return [{ source: "/api/:path*", destination: `${apiServerBase}/api/:path*` }];
	}
};
