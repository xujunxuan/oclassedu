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
        , url: app.api + '/siteindex/'
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