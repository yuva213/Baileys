import makeWASocket, { DisconnectReason, useMultiFileAuthState } from './src'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import P from 'pino'

// Set logger level to 'warn' to keep the terminal clean for the QR code
const logger = P({ level: 'warn' })

async function connectToWhatsApp() {
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')

	const sock = makeWASocket({
		auth: state,
		logger
	})

	sock.ev.on('connection.update', (update) => {
		const { connection, lastDisconnect, qr } = update

		if (qr) {
			console.log('\nScan this QR code with WhatsApp (Linked Devices):\n')
			qrcode.generate(qr, { small: true })
		}

		if (connection === 'close') {
			const shouldReconnect =
				(lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
			console.log('Connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect)
			if (shouldReconnect) {
				connectToWhatsApp()
			}
		} else if (connection === 'open') {
			console.log('Successfully connected to WhatsApp!')
		}
	})

	sock.ev.on('messages.upsert', async (event) => {
		if (event.type !== 'notify') return
		for (const m of event.messages) {
			if (m.key.fromMe) continue

			console.log(`Received message from ${m.key.remoteJid}:`)
			const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text
			console.log('Text:', messageText ?? '[Non-text message]')

			console.log('Replying to', m.key.remoteJid)
			await sock.sendMessage(m.key.remoteJid!, { text: 'Hello from Baileys!' })
		}
	})

	// Save credentials whenever they are updated
	sock.ev.on('creds.update', saveCreds)
}

connectToWhatsApp()
