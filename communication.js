var unirest		= require('unirest'),
    numeral     = require('numeral'),
    numeralLang = require('numeral/languages/de');

numeral.language('de', numeralLang);
numeral.language('de');

/**
 * @TODO: Promise all the things...
 *   */


var com = {
    _session: {},

    checkSessionToken: function(id, callback){
        
        unirest.get( process.env.CLOUDANT_URL + '/' + id )
            .auth( process.env.CLOUDANT_KEY, process.env.CLOUDANT_PASSWORD, true )
            .end(function(response){
                com._session = JSON.parse(response.body);
                console.log( 'checkSession', com._session );
                // now check the session data...
                if( session.hasOwnProperty('token') ){
                    console.log('Token', com._session.token);
                    if( com._session.token.access_token.length > 0 ){ // token was set sometime in the past
                        var now = Math.round( Date.now() / 1000 ),
                            expires = (com._session.token.issued + com._session.token.expires_in);
                            
                        if( now > expires ){ //check if token is expired
                            // refresh token
                            console.log('Expired token found...');
                            com.refeshToken(com._session, callback);
                        }else{
                            // allright return token as object
                            console.log('Perfect token found...');
                            callback(com._session);
                        }
                    }
	            }else{
                    // no token? send user to redirect to login with fidor...
                    console.log('No token found...');
                    
                }
            });
    },

    createToken: function(cid, code, uri, callback){
        unirest.post( process.env.FIDOR_AUTH_URL + '/token' )
            .auth( process.env.FIDOR_OAUTH_CLIENT_ID, process.env.FIDOR_OAUTH_CLIENT_SECRET, true )
            .send('code=' + code )
            .send('client_id=' + process.env.FIDOR_OAUTH_CLIENT_ID )
            .send('redirect_uri=' + encodeURIComponent(  + cid ) )
            .send('grant_type=authorization_code')
            .end( function(oauth_response){
                oauth_response.body.issued = Math.round(Date.now() / 1000);    
                console.log( 'TOKEN ->', oauth_response.body );
                
                com.saveAccountInCouch({
                    _id: id,
                    token: oauth_response.body,
                    account: []
                }, callback );
            });

    },

    refeshToken: function(session, callback){
		console.log(session);

	    var r = unirest.post( process.env.FIDOR_AUTH_URL + '/token' )
		    .auth( process.env.FIDOR_OAUTH_CLIENT_ID, process.env.FIDOR_OAUTH_CLIENT_SECRET, true )
		    .send('refresh_token=' + session.token.refresh_token )
		    .send('state=' +  session.token.state )
		    .send('grant_type=refresh_token')
		    .end( function(oauth_response){
			    oauth_response.body.issued = Math.round(Date.now() / 1000);
                console.log( 'Refreshed TOKEN ->', oauth_response.body );
			    var refreshedSession = {
                    _id: session._id,
                    token: oauth_response.body,
                    account: session.account
                }; 
                com.saveAccountInCouch( refreshedSession, function(){
                    callback(refreshedSession);
                }.bind(this) );
		    });
    },

    saveAccountInCouch: function(doc, callback){
	
        unirest.head( process.env.CLOUDANT_URL + '/' + doc._id )
            .auth( process.env.CLOUDANT_KEY, process.env.CLOUDANT_PASSWORD, true )
            .send()
            .end(function(couch_response){
                if(couch_response.statusCode == 200){
                    // update the doc with the proper _rev
                    doc._rev = JSON.parse(couch_response.headers.etag);
                }
                // otherwise just create it...
                unirest.put( process.env.CLOUDANT_URL + '/' + doc._id )
                    .auth( process.env.CLOUDANT_KEY, process.env.CLOUDANT_PASSWORD, true )
                    .type('json')
                    .send(doc)
                    .end( function(couch_response){
                        console.log( 'PUT SUCCESSFUL' );
                        callback();
                    });
            });
    },
    /*
        Communication with Fidor
    */
    getAccountBalance: function(id, callback){
    
        this.checkSessionToken(id, function(session){
            console.log('getAccountBalance', session);

            unirest.get( process.env.FIDOR_API_URL + 'accounts' )
                .header( 'Authorization', 'Bearer ' + session.token.access_token)
                .header( 'Accept', 'application/vnd.fidor.de; version=1,text/json')
                .end( function(r){
                    console.log('---Accounts', r.body);
                    if(r.body.hasOwnProperty('errors') ){
                        // handle Error
                    }else{
                        var result = numeral(r.body.data[0].balance).format('0.00 €');
                        callback(result);
                    }
                });
        });
    },
    getLastTransactions: function(id, limit, callback){
    
        this.checkSessionToken(id, function(session){
            console.log('getLastTransactions', session);

            unirest.get( process.env.FIDOR_API_URL + 'transactions' )
                .header( 'Authorization', 'Bearer ' + session.token.access_token)
                .header( 'Accept', 'application/vnd.fidor.de; version=1,text/json')
                .end( function(r){
                    console.log('---Transactions', r.body);
                    if(r.body.hasOwnProperty('errors') ){
                        // handle Error
                    }else{
                        var resp = [];
                        for( var i=0; i<=limit; i++ ){
                            var e = r.body.data[i];
                            resp.push( {
                                type: e.transaction_type,
                                subject: e.subject,
                                amount: numeral(e.amount).format('0.00 €'),
                                date: e.value_date
                            } );
                            //console.log(i, r.body.data[i])
                        }
                        callback(resp);
                    }
                });
        });
    }


}

module.exports = com;