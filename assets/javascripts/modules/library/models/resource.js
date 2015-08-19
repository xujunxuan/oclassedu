define([
    'app'
],function(
    app
    ){
    'use strict';
    var Model = Backbone.Model.extend({
        defaults: {}
        , initialize: function(attrs, options){
        }
        , urlRoot: app.api + '/resource/'
        , parse: function(response){
            if(response.pkg){
                return response.pkg;
            }else{
                return response;
            }
        }
    });
    return Model;
});