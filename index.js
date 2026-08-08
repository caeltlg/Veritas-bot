const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
} = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const discordToken = process.env.DISCORD_TOKEN || config.token;
const pixKey = process.env.PIX_KEY || (
    config.chavePix && config.chavePix !== 'SUA_CHAVE_PIX_AQUI'
        ? config.chavePix
        : null
);

if (!discordToken || discordToken === 'SEU_NOVO_TOKEN_AQUI') {
    throw new Error('DISCORD_TOKEN não configurado.');
}

if (!pixKey) {
    throw new Error('PIX_KEY não configurado.');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const DB_FILE = './produtos.json';

function carregarProdutos() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, '[]\n');
        return [];
    }

    try {
        const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        return Array.isArray(dados) ? dados : [];
    } catch {
        return [];
    }
}

function salvarProdutos(lista) {
    fs.writeFileSync(DB_FILE, JSON.stringify(lista, null, 2) + '\n');
}

function nomeDoCarrinho(user) {
    return `carrinho-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80)}`;
}

function eImagem(url) {
    return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url);
}

const selecoesUsuario = new Map();

client.once('ready', () => {
    console.log(`🤖 Bot da Anbu ON como: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const isAdmin = message.member?.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
    const [command] = message.content.trim().split(/\s+/);
    const comando = command?.toLowerCase();

    if (comando === '!setpix') {
        if (!isAdmin) {
            return message.reply('❌ Apenas administradores podem alterar a chave PIX!');
        }

        const novaPix = message.content.slice('!setpix'.length).trim();
        if (!novaPix) {
            return message.reply('⚠️ Uso correto: `!setpix <sua_chave_pix>`');
        }

        config.chavePix = novaPix;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2) + '\n');
        return message.reply('✅ Chave PIX atualizada com sucesso.');
    }

    if (comando === '!addproduto') {
        if (!isAdmin) {
            return message.reply('❌ Apenas administradores podem cadastrar produtos!');
        }

        const conteudo = message.content.slice('!addproduto'.length).trim();
        const partes = conteudo.split('|').map((parte) => parte.trim());

        if (partes.length < 4) {
            return message.reply(
                '⚠️ Uso correto:\n' +
                '`!addproduto Categoria | Nome | Preço | Descrição | [LinkDoVideo/Imagem]`\n\n' +
                'Exemplo:\n' +
                '`!addproduto VIP | Painel Red | R$ 30,00 | Melhor auxílio sem ban | https://exemplo.com/video.mp4`'
            );
        }

        const [categoria, nome, preco, descricao, media] = partes;
        const produtos = carregarProdutos();
        const novoProduto = {
            id: `prod_${Date.now()}`,
            categoria,
            nome,
            preco,
            descricao,
            media: media || null,
        };

        produtos.push(novoProduto);
        salvarProdutos(produtos);
        return message.reply(
            `✅ Produto **${nome}** (Categoria: **${categoria}**) cadastrado com sucesso!`
        );
    }

    if (comando === '!delproduto') {
        if (!isAdmin) {
            return message.reply('❌ Apenas administradores podem deletar produtos!');
        }

        const nomeOuId = message.content.slice('!delproduto'.length).trim();
        let produtos = carregarProdutos();
        const tamanhoInicial = produtos.length;

        produtos = produtos.filter(
            (produto) =>
                produto.nome.toLowerCase() !== nomeOuId.toLowerCase() &&
                produto.id !== nomeOuId
        );

        if (produtos.length === tamanhoInicial) {
            return message.reply('❌ Produto não encontrado. Digite o nome exato ou o ID.');
        }

        salvarProdutos(produtos);
        return message.reply('🗑️ Produto removido com sucesso!');
    }

    if (comando === '!listarprodutos') {
        if (!isAdmin) {
            return message.reply('❌ Apenas administradores podem ver a lista interna!');
        }

        const produtos = carregarProdutos();
        if (produtos.length === 0) {
            return message.reply('📦 Nenhum produto cadastrado até o momento.');
        }

        const lista = produtos.map((produto, index) =>
            `**${index + 1}. [${produto.categoria}] ${produto.nome}** — ${produto.preco}\n` +
            `📝 Descrição: ${produto.descricao}\n` +
            `🎥 Mídia: ${produto.media || 'Nenhuma'}\n---`
        );

        return message.reply(`📋 **PRODUTOS CADASTRADOS**\n\n${lista.join('\n')}`);
    }

    if (comando === '!painelvendas') {
        if (!isAdmin) {
            return message.reply('❌ Apenas administradores podem enviar o painel!');
        }

        const produtos = carregarProdutos();
        if (produtos.length === 0) {
            return message.reply(
                '⚠️ Cadastre pelo menos um produto com `!addproduto` antes de enviar o painel de vendas!'
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('🛒 ANBU SHOP — CENTRAL DE VENDAS')
            .setDescription('Selecione abaixo o produto que deseja adquirir para abrir o seu carrinho!')
            .setColor('#2b2d31')
            .setFooter({ text: 'Atendimento automático & entrega rápida.' });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('selecionar_produto')
            .setPlaceholder('📦 Escolha o produto no menu...')
            .addOptions(
                produtos.slice(0, 25).map((produto) => ({
                    label: `[${produto.categoria}] ${produto.nome}`.slice(0, 100),
                    description: `${produto.preco} — ${produto.descricao}`.slice(0, 100),
                    value: produto.id,
                }))
            );

        const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
        const rowBotao = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('abrir_carrinho')
                .setLabel('🛒 Abrir Carrinho / Comprar')
                .setStyle(ButtonStyle.Success)
        );

        return message.channel.send({
            embeds: [embed],
            components: [rowMenu, rowBotao],
        });
    }
});

client.on('interactionCreate', async (interaction) => {
    const produtos = carregarProdutos();

    if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_produto') {
        const produtoSelecionado = produtos.find(
            (produto) => produto.id === interaction.values[0]
        );

        if (!produtoSelecionado) {
            return interaction.reply({
                content: '❌ Produto não encontrado.',
                ephemeral: true,
            });
        }

        selecoesUsuario.set(interaction.user.id, produtoSelecionado);
        return interaction.reply({
            content:
                `✅ Você selecionou: **${produtoSelecionado.nome}** (${produtoSelecionado.preco}). ` +
                'Clique no botão **"Abrir Carrinho / Comprar"** para gerar seu pedido!',
            ephemeral: true,
        });
    }

    if (interaction.isButton() && interaction.customId === 'abrir_carrinho') {
        const guild = interaction.guild;
        const user = interaction.user;
        const produto = selecoesUsuario.get(user.id);

        if (!guild || !produto) {
            return interaction.reply({
                content: '⚠️ Selecione um produto no menu suspenso primeiro!',
                ephemeral: true,
            });
        }

        const nomeCarrinho = nomeDoCarrinho(user);
        const canalExistente = guild.channels.cache.find(
            (canal) => canal.name === nomeCarrinho
        );

        if (canalExistente) {
            return interaction.reply({
                content: `Você já possui um carrinho aberto em: ${canalExistente}`,
                ephemeral: true,
            });
        }

        const ticketChannel = await guild.channels.create({
            name: nomeCarrinho,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                    ],
                },
            ],
        });

        const embedPix = new EmbedBuilder()
            .setTitle(`🛒 SEU CARRINHO — ${produto.nome}`)
            .setDescription(
                `Olá ${user}, confira os detalhes do seu pedido:\n\n` +
                `📂 **Categoria:** ${produto.categoria}\n` +
                `📦 **Produto:** ${produto.nome}\n` +
                `💰 **Valor:** ${produto.preco}\n` +
                `📝 **Descrição:** ${produto.descricao}\n\n---\n` +
                `🔑 **Chave PIX:** \`${pixKey}\`\n` +
                `👤 **Titular:** ${config.donoNome || 'Anbu Shop'}\n\n` +
                '📌 Envie o comprovante do PIX neste chat para liberação do pedido!'
            )
            .setColor('#00ff7f');

        if (produto.media && eImagem(produto.media)) {
            embedPix.setImage(produto.media);
        }

        const rowFechar = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('fechar_carrinho')
                .setLabel('🔒 Fechar Carrinho (Apenas Admins)')
                .setStyle(ButtonStyle.Danger)
        );

        const mediaMensagem = produto.media
            ? `\n🎥 Mídia do Produto: ${produto.media}`
            : '';

        await ticketChannel.send({
            content: `${user}${mediaMensagem}`,
            embeds: [embedPix],
            components: [rowFechar],
        });

        return interaction.reply({
            content: `Carrinho criado em: ${ticketChannel}`,
            ephemeral: true,
        });
    }

    if (interaction.isButton() && interaction.customId === 'fechar_carrinho') {
        if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '❌ Apenas administradores podem fechar este carrinho!',
                ephemeral: true,
            });
        }

        await interaction.reply('🔒 Este carrinho será fechado em 5 segundos...');
        setTimeout(() => {
            interaction.channel?.delete().catch(() => {});
        }, 5000);
    }
});

client.login(discordToken);