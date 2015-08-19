define([
    'app'
],function(
    app
    ){
    'use strict';
    var Model = Backbone.Model.extend({
        defaults: {
            id: '',
            name: '',
            pic: ''
        }
        , initialize: function(attrs, options){
        }
        , urlRoot: app.api + '/siteindex/footer'
        , parse: function(response){
            if(response.pkg){
                return response.pkg.links;
            }else{
                return response;
            }
        }
    });
    return Model;
});