require([
    'app'
    , 'modules/library/models/site'
    , 'router'
], function(
    app
    , Site
    , Router
    ){
    "use strict";
    app.initialize();
    app.site = new Site();
    $.when(
        app.site.fetch({silent: true})
    ).always(function(){
/*        if(app.site.get('themes')){
            $('link#themes').attr('href','/assets/stylesheets/'+app.site.get('themes'));
        }*/
        var router = new Router();
    });
});