var Telegraf 	= require('telegraf'),
    com 	    = require('./communication');

var bot         = new Telegraf( process.env.TELEGRAM_TOKEN ),
    extra       = Telegraf.Extra,
    markup      = Telegraf.Extra.Markup;

if(process.env.NODE_ENV === 'production') {
    bot.useWebhook = true;
    bot.telegram.setWebHook( process.env.BOT_URL + process.env.TELEGRAM_TOKEN );
}else{
    bot.useWebhook = false;
    bot.startPolling();
}

// keyboards
var logout = extra.HTML().markup(
                markup.inlineKeyboard([
                    { text: 'Ja, bitte lösche meinen Account.', callback_data: 'Logout' }
                ]).resize().oneTime()
            );
var operation = extra.HTML().markup(
                    markup.keyboard([
                        { text: 'Show my account balance' },
                        //{ text: 'Show last transactions' },
                        { text: 'Logout' }
                    ]).resize().oneTime()
                );
var nullkeyboard = extra.HTML().markup(
                    markup.keyboard([]).hideKeyboard()
                ); 

// Start and interaction with human
// short introduction and keyboard with button to login with fidor
bot.hears('/start', function(ctx){
    console.log( '---START:', JSON.stringify(ctx) );

    return ctx.reply( "Hallo "+(ctx.from.first_name || ctx.from.username), nullkeyboard )
        .then(function(){
            return ctx.reply( "Ich bin der FidorBot. Ich schicke Dir bei jeder Kontobewegung eine Nachricht um dich auf dem laufenden zu halten.", nullkeyboard )
        })
        .then(function(){
            return ctx.reply( "Log dich hierzu einfach mit deinem Fidor Account ein und los geht's. Du kannst den Zugriff jederzeit wiederrufen.", extra.HTML().markup(
                markup.inlineKeyboard([
                    { text: 'Login', url: process.env.BOT_URL + "login?id=" + ctx.chat.id }
                ])
            ));
        });
});
// the message that should be shown after a successful login is wrapped in a function because 
// it is called from external
bot.onLoginSuccess = function(id){
    console.log( '---LOGIN:', id );

    var payload = arguments[1] || "";
    bot.telegram.sendMessage( id, 'OK läuft... ' + payload, nullkeyboard )
        .then(function(){
            bot.telegram.sendMessage( id, 'Du kannst jetzt Deinen Kontostand abfragen.', nullkeyboard );
        })
       .then(function(){
            bot.telegram.sendMessage( id, 'Ich überprüfe alle $interval Minuten ob es neue Buchungen gibt und geb Dir bescheid wenn sich etwas tut.', operation );
        });
};
// Actions to handle user inputs like...


// update data and return current account balance
bot.hears('Debug', function(ctx){
    console.log( '---DEBUG:', JSON.stringify(ctx) );
    com.checkSessionToken(ctx.chat.id, function(session){
        return ctx.reply("Session: " + JSON.stringify(session), nullkeyboard );
    });
});

bot.hears('Show my account balance', function(ctx){
    console.log('---BALANCE', ctx);

    com.getAccountBalance(ctx.chat.id, function(balance){
        return ctx.replyWithMarkdown( 'Dein Kontostand beträgt: *' + balance +'*', operation);
    });
});

bot.hears('Show last transactions', function(ctx){
    console.log('---TRANSACTIONS', ctx);

    // TEST Daten
    // "DE89370400440532013000","COBADEFFXXX","Moni Penny","2016-07-18","12345","An incoming payment"

    return ctx.reply( 'OK mal sehen was da so alles los war...', operation)
        .then(function(){
            com.getLastTransactions(ctx.chat.id, 10, function(transactions){
                var resp = "```\n";
                resp += "Datum      Betrag        Art      Betref\n\n";
                for(var i in transactions){
                    resp += transactions[i].date+"\t"+transactions[i].amount+"\t"+transactions[i].type+"\t"+transactions[i].subject+"\n";
                }
                resp += "```";
                ctx.replyWithMarkdown( resp, operation)
            });

        });
});

bot.hears('Logout', function(ctx){
    console.log('---LOGOUT', ctx);
    return ctx.reply('OK kein Problem.', nullkeyboard)
        .then(function(){
            return ctx.reply('Willst Du wirklich auf meine Dienste verzeichten?', logout);
        });
});
// destroy session and delete watch intent... answer with "Start..."
bot.on('callback_query', function(ctx){
    if( ctx.callbackQuery.data == "Logout" ){
        return ctx.answerCallbackQuery("OK Schade.", true)
            .then(function(){
                return ctx.reply("So alles bereinigt. Du kannst Dich jederzeit wieder einloggen falls Du es Dir anders überlegst.", login);
            });
    }
});
 
console.log('___BOT STARTED...');

module.exports = bot;