define([
        'app'
        , 'modules/layout/views/default'
        , 'modules/layout/views/search'
        , 'modules/library/models/index'
        , 'modules/library/views/index'
        , 'modules/library/models/library'
        , 'modules/library/views/library'
        , 'modules/library/models/category'
        , 'modules/library/views/category'
        , 'modules/library/collections/results'
        , 'modules/library/views/search'
        , 'modules/library/models/resource'
        , 'modules/library/views/resource'
        , 'modules/library/models/detail'
        , 'modules/library/views/detail_video'
        , 'modules/library/views/detail_music'
        , 'modules/library/views/detail_image'
        , 'modules/library/views/detail_document'
        , 'modules/library/collections/stats'
        , 'modules/library/views/stat'
        , 'modules/library/views/signin'
        , 'modules/library/views/signup'
    ],
    function(
        app
        , defaultLayoutView
        , searchLayoutView
        , Index
        , indexView
        , Library
        , libraryView
        , Category
        , categoryView
        , Results
        , searchView
        , Resource
        , resourceView
        , Detail
        , detailVideoView
        , detailMusicView
        , detailImageView
        , detailDocumentView
        , Stats
        , statView
        , signinView
        , signupView
        ) {
        'use strict';
        var Router = Backbone.Router.extend({
            routes: {
                '':                               'defaultAction'
                , '!/':                            'defaultAction'
                , '!/index(/)':                     'index'
                , '!/library(/)':                   'library'
                , '!/category/:id(/:page)(/)':            'category'
                , '!/resource/:id(/)':                       'resource'
                , '!/detail/:id(/)':                       'detail'
                , '!/search/:keyword(/:page)(/)':        'search'
                , '!/stat(/)':                          'stat'
                , '!/signin(/)':                       'signin'
                , '!/signup(/)':                       'signup'
            }
            /*
            index 总平台
            library 服务平台
            category 分类
            resource 课程
            detail  视频
            */
            , 'initialize': function(options){
                this.options = options || {};
                Backbone.history.start({hashChange: true, root: app.root});
            }
            , 'defaultAction': function(actions){
                this.navigate('!/library/', {trigger: true});
            }
            , 'index': function(){
                var _this = this;
                var model = new Index();
                model.fetch({
                    success: function(model, res){
                        //success:(model, response, options)
                        $.getJSON('/totalindex/siteinfo', function(json){
                            var index = new indexView({model: model, site: json.pkg});
                            _this.view && _this.view.remove();
                            _this.view = index;
                            $('body').scrollTop(0).html(index.el);
                            index.render();
                        });
                    }
                });
            }
            , 'library': function(){
                var _this = this;
                var model = new Library();
                model.fetch({
                    success: function(model, res){
                        _this.loadView(new libraryView({model: model}));
                    }
                });
            }
            , 'category': function(id, page){
                var _this = this;
                var model = new Category();
                page = page || 1;
                model.fetch({
                    data: {
                        category_id: id,
                        page: page
                    }
                    , success: function(model, res){
                        _this.loadView(new categoryView({model: model, cid: id, page: page}));
                    }
                });
            }
            , 'search': function(keyword, page){
                var _this = this;
                var collection = new Results();
                page = page || 1;
                collection.fetch({
                    data: {
                        keyword: keyword,
                        page: page
                    }
                    , success: function(collection, res){
                        _this.loadSearchView(new searchView({collection: collection, keyword: keyword, page: page}));
                    }
                });
            }
            , 'resource': function(id){
                var _this = this;
                var model = new Resource();
                model.fetch({
                    data: {
                        resource_id: id
                    }
                    , success: function(model, res){
                        _this.loadView(new resourceView({model: model}));
                    }
                });
            }
            , 'detail': function(id){
                var _this = this;
                var model = new Detail();
                model.fetch({
                    data: {
                        id: id
                    }
                    , success: function(model, res){
                        if(res.code == 0){
                            var type = model.get('data_info').resource_type;
                            //img,doc,video,music
                            if(type == 'video'){
                                _this.loadView(new detailVideoView({model: model}));
                            }else if(type == 'music'){
                                _this.loadView(new detailMusicView({model: model}));
                            }else if(type == 'img'){
                                _this.loadView(new detailImageView({model: model}));
                            }else{
                                _this.loadView(new detailDocumentView({model: model}));
                            }
                        }else{
                            alert(res.msg);
                            _this.navigate('!/', {trigger: true});
                        }
                    }
                });
            }
            , 'stat': function(id){
                var _this = this;
                var collection = new Stats();
                collection.fetch({
                    success: function(collection, res){
                        _this.loadView(new statView({collection: collection}));
                    }
                });
            }

            , 'signin': function(){
                this.loadView(new signinView());
            }
            , 'signup': function(){
                this.loadView(new signupView());
            }
            , 'loadView': function(page){
                app.setTitle(_.result(page, 'title'));
                //_.result(object, property, [defaultValue]) 
                this.view && this.view.remove();
                this.view = page;
                this.layout && this.layout.remove();
                this.layout = new defaultLayoutView({model: app.site, page: this.view});
                this.layout.$("#container").html(this.view.el);
                $('body').scrollTop(0).html(this.layout.el);
                this.view.render();
            }
            , 'loadSearchView': function(page){
                app.setTitle(_.result(page, 'title'));
                this.view && this.view.remove();
                this.view = page;
                this.layout && this.layout.remove();
                this.layout = new searchLayoutView({model: app.site, page: this.view});
                this.layout.$("#container").html(this.view.el);
                $('body').scrollTop(0).html(this.layout.el);
                this.view.render();
            }
        });
        return Router;
    });