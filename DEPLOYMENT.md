# Hostinger frontend deployment

The production frontend is configured for the domain root:

`https://ezyrentportal.com/`

## Build and upload

1. Run `npm run build` from this folder.
2. Upload the **contents** of the generated `build` folder to Hostinger's `public_html/` directory for `ezyrentportal.com`. Do not upload the `build` folder itself as a nested directory.
3. Include the generated `.htaccess` file in `public_html/`. It routes direct links such as `/login`, `/roommanager`, and `/tenant-intake` back to the React application.
4. Confirm the domain has HTTPS enabled before testing sign-in and tenant invite links.

## API and backend configuration

The frontend continues to call `http://localhost:8000/api` as configured in `.env.production`. If the backend is moved, update `REACT_APP_API_BASE` and `REACT_APP_API_ORIGIN` before building.

The backend must allow `https://ezyrentportal.com` (and `https://www.ezyrentportal.com` if the `www` domain will be used) in its CORS configuration. Its frontend base path should be empty because the app now runs at the domain root. Set the tenant form base URL to:

`https://ezyrentportal.com/tenant-intake`
