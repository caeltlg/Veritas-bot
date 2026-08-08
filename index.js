const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
} = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const discordToken = process.env.DISCORD_TOKEN || config.token;

if (!discordToken || discordToken === 'SEU_NOVO_TOKEN_AQUI') {
    throw new Error('DISCORD_TOKEN não configurado.');
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
        fs.writeFileSync(DB_FILE, `${JSON.stringify([], null, 2)}\n`);
        return [];
    }

    try {
        const produtos = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        return Array.isArray(produtos) ? produtos : [];
    } catch {
        return [];
    }
}

function salvarProdutos(lista) {
    fs.writeFileSync(DB_FILE, `${JSON.stringify(lista, null, 2)}\n`);
}

function obterPix() {
    return process.env.PIX_KEY || (
        config.chavePix && config.chavePix !== 'SUA_CHAVE_PIX_AQUI'
            ? config.chavePix
            : 'Chave PIX não configurada'
    );
}

function nomeDoCarrinho(user) {
    return `carrinho-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80)}`;
}

function eImagem(url) {
    return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url);
}

client.once('ready', () => {
    console.log(`🤖 Bot ON como: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const isAdmin = message.member?.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
    const [command] = message.content.trim().split(/\s+/);
    const commandName = command?.toLowerCase();

    if (commandName === '!setpix') {
        if (!isAdmin) return message.reply('❌ Apenas administradores!');

        const novaPix = message.content.slice('!setpix'.length).trim();
        if (!novaPix) {
            return message.reply('⚠️ Uso: `!setpix <chave_pix>`');
        }

        config.chavePix = novaPix;
        fs.writeFileSync('./config.json', `${JSON.stringify(config, null, 2)}\n`);
        return message.reply('✅ Chave PIX atualizada com sucesso.');
    }

    if (commandName === '!addproduto') {
        if (!isAdmin) return message.reply('❌ Apenas administradores!');

        const conteudo = message.content.slice('!addproduto'.length).trim();
        const partes = conteudo.split('|').map((parte) => parte.trim());

        if (partes.length < 3) {
            return message.reply(
                '⚠️ **Uso correto:**\n' +
                '`!addproduto Categoria | Nome | Preço | Descrição/Tópicos | [LinkMidia] | [ConteudoEntrega]`'
            );
        }

        const [categoria, nome, preco, descricao, media, entrega] = partes;
        const produtos = carregarProdutos();

        produtos.push({
            id: `prod_${Date.now()}`,
            categoria,
            nome,
            preco,
            descricao: descricao || 'Sem descrição',
            media: media || null,
            entrega: entrega || 'Entrega enviada via suporte.',
        });

        salvarProdutos(produtos);
        return message.reply(`✅ Produto **${nome}** cadastrado com sucesso!`);
    }

    if (commandName === '!enviarproduto') {
        if (!isAdmin) return message.reply('❌ Apenas administradores!');

        const nomeOuId = message.content.slice('!enviarproduto'.length).trim();
        const produtos = carregarProdutos();
        const produto = produtos.find(
            (item) =>
                item.nome.toLowerCase() === nomeOuId.toLowerCase() ||
                item.id === nomeOuId
        );

        if (!produto) return message.reply('❌ Produto não encontrado!');

        const topicos = produto.descricao
            .split(',')
            .map((item) => `⚙️ **${item.trim()}**`)
            .join('\n');

        const embedProduto = new EmbedBuilder()
            .setTitle(`🛍️ ${produto.nome}`)
            .setColor('#00ff00')
            .setDescription(
                `📄 **Descrição**\n${topicos}\n\n` +
                `💰 **Preço**\n${produto.preco} | ♾️ **Estoque**\n♾️ **Infinito**`
            );

        if (produto.media && eImagem(produto.media)) {
            embedProduto.setImage(produto.media);
        }

        const botaoComprar = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`buy_${produto.id}`)
                .setLabel('Comprar')
                .setEmoji('🛒')
                .setStyle(ButtonStyle.Success)
        );

        await message.channel.send({
            embeds: [embedProduto],
            components: [botaoComprar],
        });

        if (message.deletable) {
            await message.delete().catch(() => {});
        }
    }

    if (commandName === '!listarprodutos') {
        if (!isAdmin) return message.reply('❌ Apenas administradores!');

        const produtos = carregarProdutos();
        if (produtos.length === 0) {
            return message.reply('📦 Nenhum produto cadastrado.');
        }

        const lista = produtos
            .map(
                (produto, index) =>
                    `**${index + 1}. ${produto.nome}** — ${produto.preco}\n` +
                    `📦 Entrega: \`${produto.entrega}\`\n---`
            )
            .join('\n');

        return message.reply(`📋 **PRODUTOS CADASTRADOS:**\n\n${lista}`);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('buy_')) {
        const produtoId = interaction.customId.slice('buy_'.length);
        const produtos = carregarProdutos();
        const produto = produtos.find((item) => item.id === produtoId);

        if (!produto) {
            return interaction.reply({
                content: '❌ Produto indisponível.',
                ephemeral: true,
            });
        }

        const guild = interaction.guild;
        const user = interaction.user;

        if (!guild) {
            return interaction.reply({
                content: '❌ Esta ação só pode ser usada dentro de um servidor.',
                ephemeral: true,
            });
        }

        const nomeCarrinho = nomeDoCarrinho(user);
        const canalExistente = guild.channels.cache.find(
            (canal) => canal.name === nomeCarrinho
        );

        if (canalExistente) {
            return interaction.reply({
                content: `Você já tem um carrinho aberto em: ${canalExistente}`,
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

        const embedCarrinho = new EmbedBuilder()
            .setTitle(`📦 Resumo do Pedido — ${produto.nome}`)
            .setColor('#00ff00')
            .setDescription(
                `Olá ${user},\n\n` +
                `🛒 **Produto:** ${produto.nome}\n` +
                `💰 **Valor:** ${produto.preco}\n\n---\n` +
                '📌 **Instruções:**\n' +
                '1️⃣ Clique no botão **Gerar PIX** abaixo para obter os dados de pagamento.\n' +
                '2️⃣ Após realizar o pagamento, envie o comprovante neste chat.\n' +
                '3️⃣ O envio do produto é manual e será realizado dentro do prazo de até **24 horas** após a confirmação.'
            );

        const rowAcoes = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`gerarpix_${produto.id}`)
                .setLabel('Gerar PIX')
                .setEmoji('💚')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`aprovar_${produto.id}_${user.id}`)
                .setLabel('Aprovar Venda (Admin)')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('fechar_carrinho')
                .setLabel('Cancelar / Fechar')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
            embeds: [embedCarrinho],
            components: [rowAcoes],
        });

        return interaction.reply({
            content: `✅ Carrinho criado: ${ticketChannel}`,
            ephemeral: true,
        });
    }

    if (interaction.customId.startsWith('gerarpix_')) {
        const pixKey = obterPix();
        const qrCodeUrl =
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixKey)}`;

        const embedPix = new EmbedBuilder()
            .setTitle('🔑 Dados para Pagamento PIX')
            .setColor('#00ff00')
            .setDescription(
                'Copie a chave abaixo para realizar o pagamento no seu banco:\n\n' +
                `\`\`\`${pixKey}\`\`\`\n` +
                '📌 *Ou escaneie o QR Code abaixo pelo aplicativo do seu banco:*'
            )
            .setImage(qrCodeUrl);

        return interaction.reply({ embeds: [embedPix] });
    }

    if (interaction.customId.startsWith('aprovar_')) {
        if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '❌ Apenas administradores podem aprovar o pagamento!',
                ephemeral: true,
            });
        }

        const payload = interaction.customId.slice('aprovar_'.length);
        const separatorIndex = payload.lastIndexOf('_');
        const produtoId = payload.slice(0, separatorIndex);
        const userId = payload.slice(separatorIndex + 1);
        const produtos = carregarProdutos();
        const produto = produtos.find((item) => item.id === produtoId);

        if (!produto) {
            return interaction.reply({
                content: '❌ Erro ao localizar o produto.',
                ephemeral: true,
            });
        }

        const embedEntrega = new EmbedBuilder()
            .setTitle('⚡ PAGAMENTO CONFIRMADO!')
            .setColor('#00ff00')
            .setDescription(
                `Obrigado pela compra, <@${userId}>!\n\n` +
                `📦 **Seu Produto:**\n\`\`\`${produto.entrega}\`\`\`\n` +
                '*Guarde essas informações com segurança!*'
            );

        await interaction.channel.send({
            content: `<@${userId}>`,
            embeds: [embedEntrega],
        });

        const logChannel = interaction.guild?.channels.cache.find(
            (canal) =>
                canal.name.includes('vendas') ||
                canal.name.includes('compras') ||
                canal.name.includes('logs')
        );

        if (logChannel?.isTextBased()) {
            const embedLog = new EmbedBuilder()
                .setTitle('📦 Venda Confirmada')
                .setColor('#00ff00')
                .setDescription(
                    `👤 **Usuário:** <@${userId}>\n` +
                    `🛒 **Produto:** ${produto.nome}\n` +
                    `💰 **Valor:** ${produto.preco}\n` +
                    '⚙️ **Modalidade:** PIX'
                );

            await logChannel.send({ embeds: [embedLog] });
        }

        return interaction.reply({
            content: '✅ Pagamento aprovado, produto liberado e log enviado!',
            ephemeral: true,
        });
    }

    if (interaction.customId === 'fechar_carrinho') {
        if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '❌ Apenas administradores podem fechar este carrinho!',
                ephemeral: true,
            });
        }

        await interaction.reply('🔒 Fechando carrinho em 5 segundos...');
        setTimeout(() => {
            interaction.channel?.delete().catch(() => {});
        }, 5000);
    }
});

client.login(discordToken);