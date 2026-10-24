# DinDin

App financeiro (PWA) com dados no Firebase. Custo: zero.

## Publicar (uma vez)
1. **Firebase** (console.firebase.google.com) → projeto `dindin`
   - Authentication → Começar → ativar **E-mail/senha**
   - Firestore Database → Criar banco → modo produção → região `southamerica-east1`
   - Firestore → aba **Regras** → colar o conteúdo de `firestore.rules` → Publicar
   - Configurações do projeto → Seus apps → `</>` (Web) → copiar o `firebaseConfig` para `firebase-config.js`
2. **GitHub** → repositório público `dindin` → Add file → Upload files → arrastar **todos** os arquivos e a pasta `icons`
3. Repositório → Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save
4. Link fica em `https://SEU-USUARIO.github.io/dindin/` (leva 1–2 min)

## Instalar no iPhone
Safari → abrir o link → Compartilhar → **Adicionar à Tela de Início**. Criar a conta dentro do app instalado.

## Atualizar o app
Subir os arquivos novos no GitHub por cima dos antigos. O app pega a versão nova ao abrir com internet.

## Sem o firebase-config preenchido
Abre em modo demonstração: dados ficam só no aparelho.
