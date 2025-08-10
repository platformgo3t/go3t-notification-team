import * as vscode from 'vscode';
import fetch from 'node-fetch';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
    const provider = new MCPViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("mcpsearchView", provider)
    );
}

class MCPViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri],
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        // Escuchar mensajes del webview
        this._view.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'sendMessage':
                        this.sendTelegramMessage(message.text);
                        return;
                }
            },
            undefined,
            this._context.subscriptions
        );
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
    const userName = this.getUserName();
    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.css'));
    return `<!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <link href="${styleUri}" rel="stylesheet">
        <title>Panel Go3t</title>
    </head>
    <body>
        <h2>Enviar Notificacion al TEAM</h2>
        <textarea id="messageTextarea" placeholder="Escribe tu mensaje..."></textarea>
        <br/>
        <button id="sendButton">Enviar</button>

        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const sendButton = document.getElementById('sendButton');
            const messageTextarea = document.getElementById('messageTextarea');
            
            const userName = '${userName}';
            
            sendButton.addEventListener('click', () => {
                const text = messageTextarea.value;
                
                // --- CAMBIO AQUÍ ---
                // Se usa una plantilla de cadena de JavaScript (con acentos graves)
                const fullMessage = \`Usuario: \${userName}\n\nMensaje desde Visual Studio Code:\n\n\${text}\`;

                vscode.postMessage({
                    command: 'sendMessage',
                    text: fullMessage
                });
            });
        </script>
    </body>
    </html>`;
}
    private getUserName(): string {
        // Obtener el nombre de usuario del sistema operativo
        // En algunos sistemas operativos, es 'USER' o 'USERNAME'
        return os.userInfo().username || 'Usuario Desconocido';
    }
    private async sendTelegramMessage(text: string) {
        const config = vscode.workspace.getConfiguration('mcpsearch.telegram');
        const token = config.get<string>('botToken');
        const groupId = config.get<string>('groupId');
        const topicId = config.get<string>('topicId');

        if (!token || !groupId) {
            vscode.window.showErrorMessage('Por favor, configura el token del bot y el ID del grupo en las configuraciones de la extensión.');
            return;
        }

        try {
            const url = `https://api.telegram.org/bot${token}/sendMessage`;
            const body: { [key: string]: string } = {
                chat_id: groupId,
                text: text,
            };

            if (topicId) {
                body.message_thread_id = topicId;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error al enviar mensaje: ${response.status} - ${errorText}`);
            }

            vscode.window.showInformationMessage('Mensaje enviado con éxito a Telegram.');
        } catch (error) {
            vscode.window.showErrorMessage(`Error al enviar mensaje a Telegram: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function deactivate() { }