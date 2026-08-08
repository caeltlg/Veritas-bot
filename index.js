const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`🤖 Bot da Anbu ON como: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.content === '!painelvendas' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        
        const embed = new EmbedBuilder()
            .setTitle('🛒 ANBU SHOP — CENTRAL DE VENDAS')
            .setDescription('Escolha abaixo o que deseja adquirir e abra seu ticket automático de compra!')
            .setColor('#2b2d31')
            .setFooter({ text: 'Atendimento rápido e seguro.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('comprar_produto')
                .setLabel('🛒 Realizar Pedido / Chave PIX')
                .setStyle(ButtonStyle.Success)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'comprar_produto') {
        const guild = interaction.guild;
        const user = interaction.user;

        const canalExistente = guild.channels.cache.find(c => c.name === `carrinho-${user.username.toLowerCase()}`);
        if (canalExistente) {
            return interaction.reply({ content: `Você já tem um carrinho aberto em: ${canalExistente}`, ephemeral: true });
        }

        const ticketChannel = await guild.channels.create({
            name: `carrinho-${user.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
            ],
        });

        const embedPix = new EmbedBuilder()
            .setTitle('⚡ CHAVE PIX PARA PAGAMENTO')
            .setDescription(`Olá ${user}, faça o PIX para garantir seu produto!\n\n🔑 **Chave PIX:** \`${config.chavePix}\`\n👤 **Titular:** ${config.donoNome}\n\n📌 **Após fazer o PIX, envie o comprovante aqui neste chat para liberarmos seu pedido!**`)
            .setColor('#00ff7f');

        await ticketChannel.send({ content: `${user}`, embeds: [embedPix] });
        await interaction.reply({ content: `Carrinho criado em: ${ticketChannel}`, ephemeral: true });
    }
});

client.login(config.token);
