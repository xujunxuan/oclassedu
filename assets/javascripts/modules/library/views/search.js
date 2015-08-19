define([
    'app'
    , 'text!modules/library/templates/search.html'
    , 'textSearch'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        template: _.template(template)
        , events: {
            'submit #search-form': 'search',
            'click .type-menu a, .filter-list a': 'filter'
        }
        , current_filter: {
            category: '',
            college: '',
            type: ''
        }
        , initialize: function(options){
            this.options = options || {};
            this.current_filter['keyword'] = this.options.keyword;
            this.listenTo(this.collection, 'sync', this.render);
        }
        , title: function(){
            return '“' + this.options.keyword + '”的搜索结果';
        }
        , render: function(){
            this.$el.html(this.template({
                result:  this.collection.toJSON()
                , categorys: this.collection.categorys
                , colleges: this.collection.colleges
                , current_filter: this.current_filter
                , keyword: this.options.keyword
                , page: this.collection.page
                , pages: this.collection.pages
                , pagesize: this.collection.pagesize
                , cid: this.options.cid
                , current_page: this.options.page
            }));
            this.$('#result .content').textSearch(this.options.keyword);
            return this;
        }
        , search: function(e){
            e.preventDefault();
            var keyword = $(e.currentTarget).find('[name=keyword]').val();
            location.href = '#!/search/' + keyword + '/';
        }
        , filter: function(e){
            e.preventDefault();
            var filter = $(e.currentTarget).data('filter'),
                name = $(e.currentTarget).data('name');
            this.current_filter[filter] = name;
            this.collection.fetch({
                data: this.current_filter
            })
        }
    });
    return View;
});