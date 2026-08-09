const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
} = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

process.on('unhandledRejection', (error) => {
    if (error?.code === 10062 || error?.rawError?.code === 10062) {
        return;
    }

    console.error('Erro assíncrono não tratado:', error);
});

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

const slashCommands = [
    new SlashCommandBuilder()
        .setName('setpix')
        .setDescription('Define a chave PIX usada nos pagamentos')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString())
        .addStringOption((option) =>
            option
                .setName('chave')
                .setDescription('Nova chave PIX')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('addproduto')
        .setDescription('Cadastra um produto')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString())
        .addStringOption((option) =>
            option.setName('categoria').setDescription('Categoria do produto').setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('nome').setDescription('Nome do produto').setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('preco').setDescription('Preço do produto').setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('descricao').setDescription('Descrição ou tópicos').setRequired(true)
        )
        .addStringOption((option) =>
            option.setName('midia').setDescription('URL de imagem ou vídeo').setRequired(false)
        )
        .addStringOption((option) =>
            option.setName('entrega').setDescription('Conteúdo entregue após aprovação').setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('delproduto')
        .setDescription('Remove um produto pelo nome ou ID')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString())
        .addStringOption((option) =>
            option.setName('produto').setDescription('Nome exato ou ID do produto').setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setestoque')
        .setDescription('Define o estoque de um produto')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString())
        .addStringOption((option) =>
            option.setName('produto').setDescription('Nome exato ou ID do produto').setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('quantidade')
                .setDescription('Número inteiro ou infinito')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('enviarproduto')
        .setDescription('Publica um produto para venda neste canal')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString())
        .addStringOption((option) =>
            option.setName('produto').setDescription('Nome exato ou ID do produto').setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('listarprodutos')
        .setDescription('Lista os produtos cadastrados')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
].map((command) => command.toJSON());

async function registrarSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(discordToken);
    const guildId = process.env.DISCORD_GUILD_ID;
    const route = guildId
        ? Routes.applicationGuildCommands(client.user.id, guildId)
        : Routes.applicationCommands(client.user.id);

    await rest.put(route, { body: slashCommands });
    console.log(
        guildId
            ? `✅ Slash Commands registrados no servidor ${guildId}.`
            : '✅ Slash Commands registrados globalmente.'
    );
}

client.once('ready', () => {
    console.log(`🤖 Bot ON como: ${client.user.tag}`);
    registrarSlashCommands().catch((error) => {
        console.error('❌ Falha ao registrar Slash Commands:', error.message);
    });
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
            estoque: null,
        });

        salvarProdutos(produtos);
        return message.reply(`✅ Produto **${nome}** cadastrado com sucesso!`);
    }

    if (commandName === '!delproduto') {
        if (!isAdmin) return message.reply('❌ Apenas administradores!');

        const nomeOuId = message.content.slice('!delproduto'.length).trim();
        if (!nomeOuId) {
            return message.reply('⚠️ Uso: `!delproduto <nome ou ID do produto>`');
        }

        const produtos = carregarProdutos();
        const produtoRemovido = produtos.find(
            (item) =>
                item.id === nomeOuId ||
                item.nome.toLowerCase() === nomeOuId.toLowerCase()
        );

        if (!produtoRemovido) {
            return message.reply('❌ Produto não encontrado. Use o nome exato ou o ID.');
        }

        salvarProdutos(
            produtos.filter((item) => item.id !== produtoRemovido.id)
        );

        return message.reply(
            `🗑️ Produto **${produtoRemovido.nome}** removido com sucesso!`
        );
    }

    if (commandName === '!setestoque') {
        if (!isAdmin) return message.reply('❌ Apenas administradores!');

        const conteudo = message.content.slice('!setestoque'.length).trim();
        const partes = conteudo.split('|').map((parte) => parte.trim());

        if (partes.length < 2 || !partes[0] || !partes[1]) {
            return message.reply(
                '⚠️ Uso: `!setestoque <nome ou ID do produto> | <quantidade ou infinito>`'
            );
        }

        const [nomeOuId, valorEstoque] = partes;
        const produtos = carregarProdutos();
        const produto = produtos.find(
            (item) =>
                item.id === nomeOuId ||
                item.nome.toLowerCase() === nomeOuId.toLowerCase()
        );

        if (!produto) {
            return message.reply('❌ Produto não encontrado. Use o nome exato ou o ID.');
        }

        if (valorEstoque.toLowerCase() === 'infinito') {
            produto.estoque = null;
            salvarProdutos(produtos);
            return message.reply(
                `♾️ Estoque do produto **${produto.nome}** definido como infinito!`
            );
        }

        const quantidade = Number(valorEstoque);
        if (!Number.isInteger(quantidade) || quantidade < 0) {
            return message.reply(
                '⚠️ A quantidade deve ser um número inteiro maior ou igual a zero, ou `infinito`.'
            );
        }

        produto.estoque = quantidade;
        salvarProdutos(produtos);
        return message.reply(
            `📦 Estoque do produto **${produto.nome}** definido para **${quantidade}** unidade(s)!`
        );
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
                `💰 **Preço**\n${produto.preco}\n\n` +
                `♾️ **Estoque**\n${produto.estoque === null || produto.estoque === undefined ? '♾️ Infinito' : produto.estoque}`
            );

        if (produto.media && eImagem(produto.media)) {
            embedProduto.setImage(produto.media);
        }

        const componentes = [];
        if (produto.estoque !== 0) {
            componentes.push(
                new ButtonBuilder()
                    .setCustomId(`buy_${produto.id}`)
                    .setLabel('Comprar')
                    .setEmoji('🛒')
                    .setStyle(ButtonStyle.Success)
            );
        }

        await message.channel.send({
            embeds: [embedProduto],
            components: componentes.length > 0
                ? [new ActionRowBuilder().addComponents(componentes)]
                : [],
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
    if (interaction.isChatInputCommand()) {
        const isAdmin = interaction.memberPermissions?.has(
            PermissionsBitField.Flags.Administrator
        );

        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Apenas administradores podem usar este comando.',
                ephemeral: true,
            });
        }

        if (interaction.commandName === 'setpix') {
            const novaPix = interaction.options.getString('chave', true);
            config.chavePix = novaPix;
            fs.writeFileSync('./config.json', `${JSON.stringify(config, null, 2)}\n`);
            return interaction.reply('✅ Chave PIX atualizada com sucesso.');
        }

        if (interaction.commandName === 'addproduto') {
            const produto = {
                id: `prod_${Date.now()}`,
                categoria: interaction.options.getString('categoria', true),
                nome: interaction.options.getString('nome', true),
                preco: interaction.options.getString('preco', true),
                descricao: interaction.options.getString('descricao', true),
                media: interaction.options.getString('midia') || null,
                entrega:
                    interaction.options.getString('entrega') ||
                    'Entrega enviada via suporte.',
                estoque: null,
            };

            const produtos = carregarProdutos();
            produtos.push(produto);
            salvarProdutos(produtos);
            return interaction.reply(
                `✅ Produto **${produto.nome}** cadastrado com sucesso!`
            );
        }

        if (interaction.commandName === 'delproduto') {
            const nomeOuId = interaction.options.getString('produto', true);
            const produtos = carregarProdutos();
            const produto = produtos.find(
                (item) =>
                    item.id === nomeOuId ||
                    item.nome.toLowerCase() === nomeOuId.toLowerCase()
            );

            if (!produto) {
                return interaction.reply({
                    content: '❌ Produto não encontrado. Use o nome exato ou o ID.',
                    ephemeral: true,
                });
            }

            salvarProdutos(produtos.filter((item) => item.id !== produto.id));
            return interaction.reply(
                `🗑️ Produto **${produto.nome}** removido com sucesso!`
            );
        }

        if (interaction.commandName === 'setestoque') {
            const nomeOuId = interaction.options.getString('produto', true);
            const valorEstoque = interaction.options.getString('quantidade', true);
            const produtos = carregarProdutos();
            const produto = produtos.find(
                (item) =>
                    item.id === nomeOuId ||
                    item.nome.toLowerCase() === nomeOuId.toLowerCase()
            );

            if (!produto) {
                return interaction.reply({
                    content: '❌ Produto não encontrado. Use o nome exato ou o ID.',
                    ephemeral: true,
                });
            }

            if (valorEstoque.toLowerCase() === 'infinito') {
                produto.estoque = null;
                salvarProdutos(produtos);
                return interaction.reply(
                    `♾️ Estoque do produto **${produto.nome}** definido como infinito!`
                );
            }

            const quantidade = Number(valorEstoque);
            if (!Number.isInteger(quantidade) || quantidade < 0) {
                return interaction.reply(
                    '⚠️ A quantidade deve ser um inteiro maior ou igual a zero, ou `infinito`.'
                );
            }

            produto.estoque = quantidade;
            salvarProdutos(produtos);
            return interaction.reply(
                `📦 Estoque do produto **${produto.nome}** definido para **${quantidade}** unidade(s)!`
            );
        }

        if (interaction.commandName === 'listarprodutos') {
            const produtos = carregarProdutos();
            if (produtos.length === 0) {
                return interaction.reply('📦 Nenhum produto cadastrado.');
            }

            const lista = produtos
                .map(
                    (produto, index) =>
                        `**${index + 1}. ${produto.nome}** — ${produto.preco}\n` +
                        `📦 Estoque: ${produto.estoque === null || produto.estoque === undefined ? '♾️ Infinito' : produto.estoque}\n` +
                        `🚚 Entrega: \`${produto.entrega}\`\n---`
                )
                .join('\n');

            return interaction.reply(`📋 **PRODUTOS CADASTRADOS:**\n\n${lista}`);
        }

        if (interaction.commandName === 'enviarproduto') {
            const nomeOuId = interaction.options.getString('produto', true);
            const produtos = carregarProdutos();
            const produto = produtos.find(
                (item) =>
                    item.id === nomeOuId ||
                    item.nome.toLowerCase() === nomeOuId.toLowerCase()
            );

            if (!produto) {
                return interaction.reply({
                    content: '❌ Produto não encontrado!',
                    ephemeral: true,
                });
            }

            const topicos = produto.descricao
                .split(',')
                .map((item) => `⚙️ **${item.trim()}**`)
                .join('\n');
            const embedProduto = new EmbedBuilder()
                .setTitle(`🛍️ ${produto.nome}`)
                .setColor('#00ff00')
                .setDescription(
                    `📄 **Descrição**\n${topicos}\n\n` +
                    `💰 **Preço**\n${produto.preco}\n\n` +
                    `♾️ **Estoque**\n${produto.estoque === null || produto.estoque === undefined ? '♾️ Infinito' : produto.estoque}`
                );

            if (produto.media && eImagem(produto.media)) {
                embedProduto.setImage(produto.media);
            }

            const componentes = [];
            if (produto.estoque !== 0) {
                componentes.push(
                    new ButtonBuilder()
                        .setCustomId(`buy_${produto.id}`)
                        .setLabel('Comprar')
                        .setEmoji('🛒')
                        .setStyle(ButtonStyle.Success)
                );
            }

            await interaction.channel.send({
                embeds: [embedProduto],
                components: componentes.length
                    ? [new ActionRowBuilder().addComponents(componentes)]
                    : [],
            });
            return interaction.reply({
                content: '✅ Produto publicado para venda.',
                ephemeral: true,
            });
        }

        return interaction.reply({
            content: '❌ Comando não reconhecido.',
            ephemeral: true,
        });
    }

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

        if (produto.estoque === 0) {
            return interaction.reply({
                content: '❌ Este produto está sem estoque no momento.',
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

        if (produto.estoque !== null && produto.estoque !== undefined && produto.estoque <= 0) {
            return interaction.reply({
                content: '❌ Este produto ficou sem estoque e não pode ser entregue.',
                ephemeral: true,
            });
        }

        if (produto.estoque !== null && produto.estoque !== undefined) {
            produto.estoque -= 1;
            salvarProdutos(produtos);
        }

        const targetUser = await client.users.fetch(userId).catch(() => null);
        let enviadoPorDm = false;

        if (targetUser) {
            try {
                const embedDm = new EmbedBuilder()
                    .setTitle('⚡ SEU PRODUTO CHEGOU!')
                    .setColor('#00ff00')
                    .setDescription(
                        `Obrigado pela compra de **${produto.nome}**!\n\n` +
                        `📦 **Conteúdo / Acesso:**\n${produto.entrega}\n\n` +
                        '⚠️ **AVISO IMPORTANTE:** Este acesso é pessoal e intransferível. ' +
                        '**Não compartilhe com ninguém**, sob risco de banimento!\n\n' +
                        '💬 Por favor, deixe seu feedback no canal: ' +
                        'https://discord.com/channels/1486059652755095744/1508530961753575535'
                    );

                await targetUser.send({ embeds: [embedDm] });
                enviadoPorDm = true;
            } catch {
                // O usuário pode ter mensagens diretas bloqueadas.
            }
        }

        await interaction.channel.send({
            content: `<@${userId}>`,
            embeds: [
                new EmbedBuilder()
                    .setTitle('⚡ PAGAMENTO APROVADO!')
                    .setColor('#00ff00')
                    .setDescription(
                        `Obrigado pela compra, <@${userId}>!\n\n` +
                        (enviadoPorDm
                            ? '✅ O produto foi enviado diretamente para o seu **PV (Mensagem Direta)** com o aviso de segurança.\n\n'
                            : '⚠️ Não foi possível enviar uma mensagem direta. Verifique suas configurações de privacidade e fale com o suporte.\n\n') +
                        '💬 **Não se esqueça de enviar seu feedback em:**\n' +
                        'https://discord.com/channels/1486059652755095744/1508530961753575535\n\n' +
                        '*Este carrinho será fechado em breve.*'
                    ),
            ],
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

        await interaction.reply({
            content: enviadoPorDm
                ? '✅ Pagamento aprovado, produto enviado na DM e log registrado!'
                : '⚠️ Pagamento aprovado, mas não foi possível enviar a DM. O log foi registrado.',
            ephemeral: true,
        });

        setTimeout(() => {
            interaction.channel?.delete().catch(() => {});
        }, 10000);
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