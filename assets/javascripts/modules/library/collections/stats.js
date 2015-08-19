define([
    'app'
    , 'modules/library/models/stat'
],function(
    app
    , Stat
    ){
    'use strict';
    var Collection = Backbone.Model.extend({
        model: Stat
        , initialize: function(attrs, options){
        }
        , url: app.api + '/stat/'
        , parse: function(response){
            if(response.pkg){
                return response.pkg.stat_list;
            }else{
                return response;
            }
        }
    });
    return Collection;
});