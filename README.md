# ARCEUS XD — WhatsApp Bot

GitHub-ready Node.js WhatsApp bot starter.

## Setup

```bash
git clone YOUR_REPOSITORY_URL
cd ARCEUS-XD-WhatsApp-Bot
npm install
```

Edit `config.js`:
- `OWNER_NAME`
- `OWNER_NUMBER`
- `PAIRING_NUMBER`
- `PREFIX`

Then:

```bash
npm start
```

On WhatsApp, open **Linked devices → Link a device → Link with phone number instead**, then enter the pairing code printed in the terminal.

## Commands

The command registry includes General, AI, Admin, and Owner commands supplied for ARCEUS XD. The starter implements core commands such as:

- `.menu`
- `.alive`
- `.ping`
- `.uptime`
- `.botinfo`
- `.owner`
- `.setprefix`
- `.setbotname`
- `.setownername`
- `.mode`
- `.sudolist`
- `.addsudo`
- `.removesudo`
- `.restart`
- `.shutdown`

Many advanced commands are registered but intentionally return a placeholder until their APIs/handlers are connected.

## Security

Never commit `auth_info/`, session credentials, API keys, or private tokens to GitHub.
