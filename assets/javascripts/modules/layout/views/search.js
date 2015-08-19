define([
    'app'
    , 'text!modules/layout/templates/search.html'
    ],function(
        app
        , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        template: _.template(template)
        , events: {
            'submit #search-form': 'search'
        }
        , initialize: function(options){
            this.options = options || {};
            this.render();
        }
        , render: function(){
            this.$el.html(this.template({
                site: app.site.toJSON(),
                cateid: _.result(this.options.page, 'cateid')
            }));
        }
        , search: function(e){
            e.preventDefault();
            var keyword = $(e.currentTarget).find('[name=keyword]').val();
            location.href = '#!/search/' + keyword + '/';
        }
    });
    return View;
});